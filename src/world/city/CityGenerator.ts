import { clamp, hashCoords, lerp } from '../../core/math';
import { Random } from '../../core/random';
import type { CityConfig, Range } from '../../config/city';
import { districtAt } from './district';
import { SIZE_OF, type ChunkSpec, type District, type PartSpec, type PoolId, type StructureKind, type StructureSpec } from './types';

const COLORS = {
  road: 0x3c3d3f,
  lawn: 0x6d8650,
  concrete: 0x8f8c84,
  quay: 0x7d7a73,
  roof: 0x8a4b3a,
  rooftop: 0x8c8c88,
  tree: 0xffffff, // tree pool uses vertex colors; instance color tints
  containers: [0xb0442f, 0x2f6fa8, 0x3d8a4a, 0xd19a2b, 0x7a7d80, 0x9b3f78],
};

/**
 * Deterministic chunk generator: same seed + chunk coords = same content,
 * so destroyed state can be persisted as indices and chunks can be rebuilt.
 */
export class CityGenerator {
  private readonly pitch: number;
  readonly chunkSize: number;

  constructor(private readonly c: CityConfig) {
    this.pitch = c.blockSize + c.streetWidth;
    this.chunkSize = this.pitch * 2;
  }

  generate(cx: number, cz: number): ChunkSpec {
    const S = this.chunkSize;
    const x0 = cx * S;
    const z0 = cz * S;
    const district = districtAt(x0 + S / 2, z0 + S / 2, this.c);
    const rng = new Random(hashCoords(cx, cz, this.c.seed));
    const chunk: ChunkSpec = { cx, cz, district, structures: [], flats: [] };
    if (district === 'sea') return chunk;

    this.roads(chunk, x0, z0);
    const half = this.c.streetWidth / 2;
    const B = this.c.blockSize;
    for (const bx of [0, 1]) {
      for (const bz of [0, 1]) {
        const minX = x0 + bx * this.pitch + half;
        const minZ = z0 + bz * this.pitch + half;
        this.block(chunk, district, rng, minX, minZ, B);
      }
    }
    this.cars(chunk, district, rng, x0, z0);

    // Keep the spawn point clear.
    const { spawnX, spawnZ, spawnClearRadius: r } = this.c;
    chunk.structures = chunk.structures.filter(
      (s) => Math.hypot(s.x - spawnX, s.z - spawnZ) > r + Math.max(s.halfW, s.halfD),
    );
    return chunk;
  }

  // ------------------------------------------------------------- layout

  private roads(chunk: ChunkSpec, x0: number, z0: number): void {
    const S = this.chunkSize;
    const W = this.c.streetWidth;
    for (const o of [0, this.pitch]) {
      chunk.flats.push(flat(x0 + o, z0 + S / 2, W, S, COLORS.road, 0.03));
      chunk.flats.push(flat(x0 + S / 2, z0 + o, S, W, COLORS.road, 0.03));
    }
  }

  private block(chunk: ChunkSpec, d: District, rng: Random, minX: number, minZ: number, B: number): void {
    const cx = minX + B / 2;
    const cz = minZ + B / 2;
    switch (d) {
      case 'downtown':
        chunk.flats.push(flat(cx, cz, B, B, COLORS.concrete, 0.015));
        return this.downtownBlock(chunk, rng, cx, cz, B);
      case 'fringe':
        chunk.flats.push(flat(cx, cz, B, B, COLORS.concrete, 0.015));
        return rng.chance(0.15) ? this.shopBlock(chunk, rng, cx, cz, B) : this.midriseBlock(chunk, rng, cx, cz, B);
      case 'suburbs':
        chunk.flats.push(flat(cx, cz, B, B, COLORS.lawn, 0.015));
        return rng.chance(0.1) ? this.shopBlock(chunk, rng, cx, cz, B) : this.suburbBlock(chunk, rng, minX, minZ, B);
      case 'industrial':
        chunk.flats.push(flat(cx, cz, B, B, COLORS.concrete, 0.015));
        return this.industrialBlock(chunk, rng, cx, cz, B);
      case 'docks':
        chunk.flats.push(flat(cx, cz, B, B, COLORS.quay, 0.015));
        return this.docksBlock(chunk, rng, cx, cz, B);
      case 'sea':
        return;
    }
  }

  private downtownBlock(chunk: ChunkSpec, rng: Random, cx: number, cz: number, B: number): void {
    const t = clamp(Math.hypot(cx, cz) / this.c.downtownRadius, 0, 1);
    const hc = this.c.towerHeightCenter;
    const he = this.c.towerHeightEdge;
    const height = () => rng.range(lerp(hc.min, he.min, t), lerp(hc.max, he.max, t));
    const color = () => hsl(rng.range(0.55, 0.62), rng.range(0.04, 0.14), rng.range(0.42, 0.66));
    const roll = rng.next();
    if (roll < 0.45) {
      this.tower(chunk, rng, cx, cz, rng.range(55, 80), rng.range(55, 80), height(), color());
    } else if (roll < 0.85) {
      const ox = B / 4 + 1;
      for (const s of [-1, 1]) this.tower(chunk, rng, cx + s * ox, cz + rng.range(-12, 12), rng.range(34, 44), rng.range(50, 80), height() * 0.85, color());
    } else {
      this.midriseBlock(chunk, rng, cx, cz, B);
    }
  }

  private tower(chunk: ChunkSpec, rng: Random, x: number, z: number, w: number, d: number, h: number, color: number): void {
    const parts: PartSpec[] = [];
    if (h > 100 && rng.chance(0.55)) {
      const mainH = h * rng.range(0.65, 0.8);
      parts.push(part('windowed', x, 0, z, w, mainH, d, 0, color));
      parts.push(part('windowed', x, mainH, z, w * 0.68, h - mainH, d * 0.68, 0, color));
    } else {
      parts.push(part('windowed', x, 0, z, w, h, d, 0, color));
    }
    if (rng.chance(0.7)) {
      parts.push(part('plain', x + rng.range(-5, 5), h, z + rng.range(-5, 5), rng.range(8, 14), rng.range(3, 6), rng.range(8, 14), 0, COLORS.rooftop));
    }
    this.add(chunk, 'tower', x, z, w / 2, d / 2, h, 0, parts);
  }

  private midriseBlock(chunk: ChunkSpec, rng: Random, cx: number, cz: number, B: number): void {
    const q = B / 4;
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      if (rng.chance(0.12)) continue;
      const w = rng.range(28, 44);
      const d = rng.range(28, 44);
      const h = range(rng, this.c.midriseHeight);
      const x = cx + ox * q;
      const z = cz + oz * q;
      const color = hsl(rng.range(0.04, 0.12), rng.range(0.05, 0.2), rng.range(0.45, 0.72));
      const parts = [part('windowed', x, 0, z, w, h, d, 0, color)];
      if (rng.chance(0.5)) parts.push(part('plain', x, h, z, rng.range(6, 10), 3, rng.range(6, 10), 0, COLORS.rooftop));
      this.add(chunk, 'midrise', x, z, w / 2, d / 2, h, 0, parts);
    }
  }

  private shopBlock(chunk: ChunkSpec, rng: Random, cx: number, cz: number, B: number): void {
    for (const oz of [-1, 1]) {
      let x = cx - B / 2 + 3;
      for (;;) {
        const w = rng.range(14, 26);
        if (x + w > cx + B / 2 - 3) break;
        const d = rng.range(16, 24);
        const h = range(rng, this.c.shopHeight);
        const z = cz + oz * (B / 2 - d / 2 - 3);
        const sx = x + w / 2;
        const color = hsl(rng.range(0, 1), rng.range(0.15, 0.35), rng.range(0.5, 0.75));
        this.add(chunk, 'shop', sx, z, w / 2, d / 2, h, 0, [part('windowed', sx, 0, z, w, h, d, 0, color)]);
        x += w + rng.range(1, 4);
      }
    }
  }

  private suburbBlock(chunk: ChunkSpec, rng: Random, minX: number, minZ: number, B: number): void {
    const lots = 4;
    const lot = B / lots;
    for (let a = 0; a < lots; a++) {
      for (let b = 0; b < lots; b++) {
        const x = minX + (a + 0.5) * lot;
        const z = minZ + (b + 0.5) * lot;
        if (rng.chance(0.82)) {
          const w = rng.range(9, 13);
          const d = rng.range(8, 11);
          const h = range(rng, this.c.houseHeight);
          const rot = rng.chance(0.5) ? 0 : Math.PI / 2;
          const wall = hsl(rng.range(0.05, 0.14), rng.range(0.15, 0.35), rng.range(0.55, 0.78));
          const roof = hsl(rng.range(0.0, 0.06), rng.range(0.25, 0.45), rng.range(0.25, 0.4));
          this.add(chunk, 'house', x, z, w / 2, d / 2, h * 1.55, rot, [
            part('windowed', x, 0, z, w, h, d, rot, wall),
            part('roof', x, h, z, w * 1.08, h * 0.55, d * 1.05, rot, roof),
          ]);
        }
        for (let t = 0; t < 2; t++) {
          if (!rng.chance(0.5)) continue;
          const s = rng.range(1, 1.7);
          const m = lot / 2 - 2.8 * s;
          const tx = x + rng.range(-m, m);
          const tz = z + rng.range(-m, m);
          this.add(chunk, 'tree', tx, tz, 2.8 * s, 2.8 * s, 8 * s, 0, [
            part('tree', tx, 0, tz, s, s, s, rng.range(0, Math.PI * 2), hsl(0.25, rng.range(0, 0.2), rng.range(0.85, 1))),
          ]);
        }
      }
    }
  }

  private industrialBlock(chunk: ChunkSpec, rng: Random, cx: number, cz: number, B: number): void {
    const w = rng.range(45, 85);
    const d = rng.range(30, 50);
    const h = range(rng, this.c.warehouseHeight);
    const wz = cz - B / 2 + d / 2 + 4;
    const wx = cx + rng.range(-(B - w) / 2, (B - w) / 2);
    const color = hsl(rng.range(0.05, 0.6), rng.range(0.05, 0.2), rng.range(0.45, 0.65));
    this.add(chunk, 'warehouse', wx, wz, w / 2, d / 2, h, 0, [part('plain', wx, 0, wz, w, h, d, 0, color)]);

    const backZ = cz + B / 4 + 4;
    if (rng.chance(0.6)) {
      const r = rng.range(2.5, 4);
      const ch = range(rng, this.c.chimneyHeight);
      const x = cx + rng.range(-B / 3, B / 3);
      this.add(chunk, 'chimney', x, backZ, r, r, ch, 0, [part('cylinder', x, 0, backZ, r * 2, ch, r * 2, 0, 0x8c7466)]);
    }
    const tanks = rng.int(0, 3);
    for (let i = 0; i < tanks; i++) {
      const r = rng.range(6, 10);
      const th = range(rng, this.c.tankHeight);
      const x = cx - B / 2 + r + 2 + i * (B / 3);
      const z = cz + B / 2 - r - 2;
      this.add(chunk, 'tank', x, z, r, r, th, 0, [part('cylinder', x, 0, z, r * 2, th, r * 2, 0, 0xc9c6bd)]);
    }
  }

  private docksBlock(chunk: ChunkSpec, rng: Random, cx: number, cz: number, B: number): void {
    const w = rng.range(50, 85);
    const d = rng.range(28, 38);
    const h = range(rng, this.c.warehouseHeight);
    const wz = cz - B / 2 + d / 2 + 3;
    this.add(chunk, 'warehouse', cx, wz, w / 2, d / 2, h, 0, [
      part('plain', cx, 0, wz, w, h, d, 0, hsl(rng.range(0.55, 0.62), rng.range(0.1, 0.25), rng.range(0.45, 0.6))),
    ]);
    // Container rows: 2.4 x 2.6 x 12 m, stacked 1-3 high.
    for (let row = 0; row < 4; row++) {
      const z = cz + 4 + row * 11;
      for (let i = 0; i < 12; i++) {
        if (rng.chance(0.25)) continue;
        const x = cx - B / 2 + 6 + i * 7.6;
        const stack = rng.int(1, 3);
        const parts: PartSpec[] = [];
        for (let k = 0; k < stack; k++) {
          parts.push(part('plain', x, k * 2.6, z, 2.4, 2.6, 12, Math.PI / 2, rng.pick(COLORS.containers)));
        }
        this.add(chunk, 'container', x, z, 6, 1.2, stack * 2.6, Math.PI / 2, parts);
      }
    }
  }

  private cars(chunk: ChunkSpec, d: District, rng: Random, x0: number, z0: number): void {
    if (d === 'sea') return;
    const density = this.c.carDensity[d];
    const S = this.chunkSize;
    const W = this.c.streetWidth;
    const lane = W / 2 - 3.5;
    const isCrossing = (t: number) => t < W / 2 + 4 || Math.abs(t - this.pitch) < W / 2 + 4 || t > S - 6;
    const colors = () => hsl(rng.next(), rng.range(0.2, 0.7), rng.range(0.25, 0.65));
    for (const o of [0, this.pitch]) {
      for (const side of [-1, 1]) {
        for (let t = rng.range(0, 12); t < S; t += 100 / density * rng.range(0.4, 1.6)) {
          if (isCrossing(t)) continue;
          // Street along z (at x = x0 + o) and along x (at z = z0 + o).
          const ax = x0 + o + side * lane;
          const az = z0 + t;
          this.add(chunk, 'car', ax, az, 0.95, 2.3, 1.6, 0, [part('car', ax, 0, az, 1.9, 1.6, 4.6, 0, colors())]);
          const bx = x0 + t;
          const bz = z0 + o + side * lane;
          this.add(chunk, 'car', bx, bz, 0.95, 2.3, 1.6, Math.PI / 2, [part('car', bx, 0, bz, 1.9, 1.6, 4.6, Math.PI / 2, colors())]);
        }
      }
    }
  }

  private add(chunk: ChunkSpec, kind: StructureKind, x: number, z: number, halfW: number, halfD: number, height: number, rotY: number, parts: PartSpec[]): void {
    chunk.structures.push({ kind, size: SIZE_OF[kind], x, z, halfW, halfD, height, rotY, parts } satisfies StructureSpec);
  }
}

// ------------------------------------------------------------- helpers

function part(pool: PoolId, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number, color: number): PartSpec {
  return { pool, x, y, z, sx, sy, sz, rotY, color };
}

function flat(x: number, z: number, sx: number, sz: number, color: number, y: number): PartSpec {
  return part('flat', x, y, z, sx, 1, sz, 0, color);
}

function range(rng: Random, r: Range): number {
  return rng.range(r.min, r.max);
}

/** HSL (0..1) to 0xRRGGBB, sRGB. */
export function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
