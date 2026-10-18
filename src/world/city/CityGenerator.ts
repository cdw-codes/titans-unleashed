import { clamp, hashCoords, lerp } from '../../core/math';
import { Random } from '../../core/random';
import type { CityConfig, Range } from '../../config/city';
import { TERRAIN_COLORS } from '../../config/terrain';
import { terrain as worldTerrain, type Terrain } from '../terrain/Terrain';
import { chunkPlace, type ChunkPlace } from './district';
import { flat, hsl, part } from './parts';
import { Sites, ROAD_COLOR } from './sites';
import { SIZE_OF, type ChunkSpec, type PartSpec, type PoolId, type StructureKind, type StructureSpec, type UrbanDistrict } from './types';

export { ROAD_COLOR };

const COLORS = {
  road: ROAD_COLOR,
  lawn: 0x7fa04f,
  concrete: 0xa8a396,
  quay: 0x8c8880,
  roof: 0x8a4b3a,
  rooftop: 0x8c8c88,
  park: 0x86ab55,
  pond: 0x5f8ea6,
  containers: [0xb0442f, 0x2f6fa8, 0x3d8a4a, 0xd19a2b, 0x7a7d80, 0x9b3f78],
  /** Tree crowns (instance colors; the tree pools keep trunks dark). */
  autumn: TERRAIN_COLORS.canopy,
  pines: [0x3f6d33, 0x4c7a3a, 0x335c33, 0x6e8a3a, 0xc9a23a],
  barns: [0x9c3b2c, 0x8a3a2a, 0xa65a35, 0x7d6a55],
};

/** Terrain samples per chunk edge (16 m cells at the default chunk size). */
export const GROUND_CELLS = 16;

/**
 * Deterministic chunk generator: same seed + chunk coords = same content,
 * so destroyed state can be persisted as indices and chunks can be rebuilt.
 */
export class CityGenerator {
  private readonly pitch: number;
  readonly chunkSize: number;

  private readonly sites: Sites;
  /** Town being generated (styles its blocks). */
  private place: ChunkPlace | null = null;

  constructor(private readonly c: CityConfig, private readonly terrain: Terrain = worldTerrain) {
    this.pitch = c.blockSize + c.streetWidth;
    this.chunkSize = this.pitch * 2;
    this.sites = new Sites(terrain, this.pitch);
  }

  generate(cx: number, cz: number): ChunkSpec {
    const S = this.chunkSize;
    const x0 = cx * S;
    const z0 = cz * S;
    const place = chunkPlace(x0, z0, S, this.terrain, this.c);
    const district = place.district;
    const rng = new Random(hashCoords(cx, cz, this.c.seed));
    const ground = this.terrain.buildTile(x0, z0, S, GROUND_CELLS, this.pitch);
    const chunk: ChunkSpec = { cx, cz, district, structures: [], flats: [], ground };
    if (district === 'forest' || district === 'farmland' || district === 'meadow') {
      this.countryside(chunk, district, rng, x0, z0);
    } else if (district !== 'sea' && district !== 'airport' && district !== 'plant') {
      this.place = place;
      this.town(chunk, district, rng, x0, z0);
      this.place = null;
    }
    // Authored set pieces (bridge, airport, power station, landmarks) go in on top.
    const site = this.sites.forChunk(x0, z0, S);
    chunk.structures.push(...site.structures);
    chunk.flats.push(...site.flats);

    // Keep the spawn point clear.
    const { spawnX, spawnZ, spawnClearRadius: r } = this.c;
    chunk.structures = chunk.structures.filter(
      (s) => Math.hypot(s.x - spawnX, s.z - spawnZ) > r + Math.max(s.halfW, s.halfD),
    );
    return chunk;
  }

  /** Street grid with blocks (towns are flat at y = 0); nothing where the coast cuts in. */
  private town(chunk: ChunkSpec, district: UrbanDistrict, rng: Random, x0: number, z0: number): void {
    const bridges = this.roads(chunk, x0, z0);
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
    const dry = (x: number, z: number) => !this.terrain.isWater(x, z, 1);
    chunk.structures = chunk.structures.filter((s) => dry(s.x, s.z));
    chunk.flats = chunk.flats.filter((f) => dry(f.x, f.z));
    chunk.structures.push(...bridges);
  }

  // ------------------------------------------------------------- countryside

  private countryside(chunk: ChunkSpec, biome: 'forest' | 'farmland' | 'meadow', rng: Random, x0: number, z0: number): void {
    const S = this.chunkSize;
    const t = this.terrain;
    const cfg = t.c;
    // Forest: jittered grid, kept by local density so edges thin out naturally.
    const cell = Math.sqrt(10000 / cfg.forestTreesPerHa);
    const n = Math.floor(S / cell);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = x0 + (i + rng.range(0.1, 0.9)) * (S / n);
        const z = z0 + (j + rng.range(0.1, 0.9)) * (S / n);
        if (rng.next() < t.forestDensity(x, z) * (1 - t.urbanWeight(x, z)) && !this.inSite(x, z)) this.tree(chunk, rng, x, z, 1.5, 2.7);
      }
    }
    // Clumps of trees in the open.
    const clumps = Math.round((cfg.meadowTreesPerHa * (S * S) / 10000) / 5 * rng.range(0.4, 1.6));
    for (let k = 0; k < clumps; k++) {
      const cxp = x0 + rng.range(20, S - 20);
      const czp = z0 + rng.range(20, S - 20);
      for (let m = rng.int(3, 8); m > 0; m--) {
        const x = cxp + rng.range(-25, 25);
        const z = czp + rng.range(-25, 25);
        if (!this.inSite(x, z)) this.tree(chunk, rng, x, z, 1.2, 2.3);
      }
    }
    // Outskirts: houses straggle out along the edge of town.
    const u = t.urbanWeight(x0 + S / 2, z0 + S / 2);
    for (let k = Math.round(u * rng.range(0, 4)); k > 0; k--) {
      const x = x0 + rng.range(20, S - 20);
      const z = z0 + rng.range(20, S - 20);
      if (!this.inSite(x, z)) this.house(chunk, rng, x, z, rng.chance(0.5) ? 0 : Math.PI / 2);
    }
    const fx = x0 + S / 2;
    const fz = z0 + S / 2;
    if (biome === 'farmland' && rng.chance(0.6) && !this.inSite(fx, fz)) this.farm(chunk, rng, x0 + rng.range(60, S - 60), z0 + rng.range(60, S - 60));
    if (biome === 'forest' && rng.chance(0.08)) this.house(chunk, rng, x0 + rng.range(40, S - 40), z0 + rng.range(40, S - 40), rng.next() * Math.PI);
  }

  /** Inside an authored site (airport, power station, island) where nothing else may stand. */
  private inSite(x: number, z: number): boolean {
    for (const t of this.terrain.authored) {
      if ((t.kind === 'airport' || t.kind === 'plant' || t.kind === 'island') && this.terrain.townEdge(t, x, z) < 60) return true;
    }
    return false;
  }

  /** Farmhouse, barn, a silo or two and a windbreak row. */
  private farm(chunk: ChunkSpec, rng: Random, x: number, z: number): void {
    if (this.terrain.isWater(x, z, 2)) return;
    const rot = rng.chance(0.5) ? 0 : Math.PI / 2;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
    this.house(chunk, rng, ...at(-22, 0), rot);
    const [bx, bz] = at(14, 4);
    const bw = rng.range(16, 22);
    const bd = rng.range(24, 32);
    const bh = rng.range(7, 10);
    const by = this.baseY(bx, bz, bw / 2, bd / 2);
    if (by < this.terrain.waterLevel + 1) return;
    const barn = rng.pick(COLORS.barns);
    this.add(chunk, 'barn', bx, bz, bw / 2, bd / 2, bh * 1.6, rot, [
      part('plain', bx, by, bz, bw, bh, bd, rot, barn),
      part('roof', bx, by + bh, bz, bw * 1.06, bh * 0.6, bd * 1.02, rot, 0x5b4a42),
    ], by);
    for (let k = rng.int(1, 2); k > 0; k--) {
      const [sx, sz] = at(34 + k * 11, -10);
      const r = rng.range(3.5, 5);
      const h = range(rng, this.c.siloHeight);
      const sy = this.baseY(sx, sz, r, r);
      this.add(chunk, 'silo', sx, sz, r, r, h, 0, [
        part('cylinder', sx, sy, sz, r * 2, h, r * 2, 0, 0xc8c3b8),
        part('cylinder', sx, sy + h, sz, r * 1.7, r * 0.8, r * 1.7, 0, 0x8b9196),
      ], sy);
    }
    for (let k = 0; k < 7; k++) {
      const [tx, tz] = at(-40 + k * 14, 32);
      this.tree(chunk, rng, tx, tz, 1.3, 1.9);
    }
  }

  private house(chunk: ChunkSpec, rng: Random, x: number, z: number, rot: number): void {
    if (this.terrain.isWater(x, z, 2)) return;
    const w = rng.range(10, 14);
    const d = rng.range(8, 11);
    const h = range(rng, this.c.houseHeight);
    const y = this.baseY(x, z, w / 2, d / 2);
    if (y < this.terrain.waterLevel + 1) return;
    const wall = hsl(rng.range(0.07, 0.13), rng.range(0.2, 0.4), rng.range(0.62, 0.82));
    const roof = hsl(rng.range(0.0, 0.05), rng.range(0.35, 0.55), rng.range(0.28, 0.42));
    this.add(chunk, 'house', x, z, w / 2, d / 2, h * 1.55, rot, [
      part('windowed', x, y, z, w, h, d, rot, wall),
      part('roof', x, y + h, z, w * 1.08, h * 0.55, d * 1.05, rot, roof),
    ], y);
  }

  /** A tree on the ground at (x, z): pines on high or cold ground, broadleaf in autumn colors lower down. */
  private tree(chunk: ChunkSpec, rng: Random, x: number, z: number, minScale: number, maxScale: number): void {
    const t = this.terrain;
    const h = t.heightAt(x, z);
    if (h < t.waterLevel + 1.5) return;
    const s = rng.range(minScale, maxScale);
    const pine = rng.next() < clamp((h - 30) / 120, 0.08, 0.85);
    const color = pine ? rng.pick(COLORS.pines) : rng.pick(COLORS.autumn);
    const r = (pine ? 2.2 : 2.8) * s;
    this.add(chunk, 'tree', x, z, r, r, (pine ? 11 : 8) * s, 0, [
      part(pine ? 'pine' : 'tree', x, h - 0.4, z, s, s, s, rng.range(0, Math.PI * 2), color),
    ], h);
  }

  /** Lowest ground under a footprint, so buildings on slopes sink in rather than float. */
  private baseY(x: number, z: number, hw: number, hd: number): number {
    const t = this.terrain;
    const r = Math.max(hw, hd);
    return Math.min(t.heightAt(x, z), t.heightAt(x - r, z - r), t.heightAt(x + r, z - r), t.heightAt(x - r, z + r), t.heightAt(x + r, z + r)) - 0.3;
  }

  // ------------------------------------------------------------- layout

  /**
   * Streets as flats, split where they cross water; returns the bridge spans.
   * Only every other street gets a bridge (real cities bridge a river every few
   * blocks), and stretches that run along a river are dropped rather than bridged.
   */
  private roads(chunk: ChunkSpec, x0: number, z0: number): StructureSpec[] {
    const S = this.chunkSize;
    const W = this.c.streetWidth;
    const piece = 32;
    const n = S / piece;
    const bridges: StructureSpec[] = [];
    for (const o of [0, this.pitch]) {
      for (const alongX of [false, true]) {
        let run = -1;
        let wet: [number, number][] = [];
        const flush = (end: number) => {
          if (run < 0) return;
          const mid = ((run + end) * piece) / 2;
          const len = (end - run) * piece;
          chunk.flats.push(alongX ? flat(x0 + mid, z0 + o, len, W, COLORS.road, 0.03) : flat(x0 + o, z0 + mid, W, len, COLORS.road, 0.03));
          run = -1;
        };
        const flushWet = (open: boolean) => {
          // A short wet stretch with dry street on the far side is a crossing.
          if (wet.length && o === 0 && wet.length * piece <= 200 && open) {
            for (const [x, z] of wet) bridges.push(this.roadBridge(x, z, alongX, piece, W));
          }
          wet = [];
        };
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) * piece;
          const x = alongX ? x0 + t : x0 + o;
          const z = alongX ? z0 + o : z0 + t;
          if (this.terrain.isWater(x, z, 1)) {
            flush(k);
            if (!this.terrain.isSea(x, z)) wet.push([x, z]);
          } else {
            flushWet(true);
            if (run < 0) run = k;
          }
        }
        flush(n);
        // Stretches reaching the chunk edge: bridge them if the street continues dry beyond.
        if (wet.length) {
          const [lx, lz] = wet[wet.length - 1]!;
          const beyond = alongX ? [lx + piece * 3, lz] : [lx, lz + piece * 3];
          flushWet(!this.terrain.isWater(beyond[0]!, beyond[1]!, 1) || wet.length < 4);
        }
      }
    }
    return bridges;
  }

  /** A street span over water: deck, parapets and a pier down to the bed (crushed on contact). */
  private roadBridge(x: number, z: number, alongX: boolean, len: number, W: number): StructureSpec {
    const rot = alongX ? Math.PI / 2 : 0;
    const bed = this.terrain.heightAt(x, z);
    const side = (k: number): [number, number] => (alongX ? [x, z + k] : [x + k, z]);
    const parts: PartSpec[] = [
      part('plain', x, -2.4, z, W, 2.5, len + 0.5, rot, COLORS.road),
      part('plain', ...withY(side(-W / 2 + 0.6), 0.1), 1.2, 1.4, len + 0.5, rot, 0x9a9890),
      part('plain', ...withY(side(W / 2 - 0.6), 0.1), 1.2, 1.4, len + 0.5, rot, 0x9a9890),
      part('plain', x, bed, z, 6, -2.4 - bed, 6, rot, 0x8a8680),
    ];
    return { kind: 'bridge', size: SIZE_OF.bridge, x, z, y: -2.4, halfW: alongX ? len / 2 : W / 2, halfD: alongX ? W / 2 : len / 2, height: 4, rotY: 0, parts };
  }

  private block(chunk: ChunkSpec, d: UrbanDistrict, rng: Random, minX: number, minZ: number, B: number): void {
    const cx = minX + B / 2;
    const cz = minZ + B / 2;
    if (this.sites.isReserved(cx, cz, B / 2)) {
      chunk.flats.push(flat(cx, cz, B, B, COLORS.concrete, 0.015));
      return;
    }
    switch (d) {
      case 'downtown':
        chunk.flats.push(flat(cx, cz, B, B, COLORS.concrete, 0.015));
        return this.downtownBlock(chunk, rng, cx, cz, B);
      case 'fringe':
        if (rng.chance(0.07)) return this.parkBlock(chunk, rng, cx, cz, B);
        chunk.flats.push(flat(cx, cz, B, B, COLORS.concrete, 0.015));
        return rng.chance(0.15) ? this.shopBlock(chunk, rng, cx, cz, B) : this.midriseBlock(chunk, rng, cx, cz, B);
      case 'suburbs':
        if (rng.chance(0.06)) return this.parkBlock(chunk, rng, cx, cz, B);
        chunk.flats.push(flat(cx, cz, B, B, COLORS.lawn, 0.015));
        return rng.chance(0.1) ? this.shopBlock(chunk, rng, cx, cz, B) : this.suburbBlock(chunk, rng, minX, minZ, B);
      case 'industrial':
        chunk.flats.push(flat(cx, cz, B, B, COLORS.concrete, 0.015));
        return this.industrialBlock(chunk, rng, cx, cz, B);
      case 'docks':
        chunk.flats.push(flat(cx, cz, B, B, COLORS.quay, 0.015));
        return this.docksBlock(chunk, rng, cx, cz, B);
    }
  }

  /** Lawn, trees round the edge and sometimes a pond: open space for scale. */
  private parkBlock(chunk: ChunkSpec, rng: Random, cx: number, cz: number, B: number): void {
    chunk.flats.push(flat(cx, cz, B, B, COLORS.park, 0.015));
    const pond = rng.chance(0.55);
    if (pond) chunk.flats.push(flat(cx + rng.range(-10, 10), cz + rng.range(-10, 10), rng.range(30, 50), rng.range(26, 44), COLORS.pond, 0.025));
    for (let k = rng.int(10, 18); k > 0; k--) {
      const edge = rng.chance(0.7);
      const a = rng.range(0, Math.PI * 2);
      const r = edge ? B * 0.42 : rng.range(0, B * 0.4);
      const x = cx + Math.sin(a) * r;
      const z = cz + Math.cos(a) * r;
      if (pond && Math.abs(x - cx) < 30 && Math.abs(z - cz) < 28) continue;
      const s = rng.range(1.1, 1.8);
      this.add(chunk, 'tree', x, z, 2.8 * s, 2.8 * s, 8 * s, 0, [part('tree', x, 0, z, s, s, s, rng.range(0, Math.PI * 2), rng.pick(COLORS.autumn))]);
    }
  }

  private downtownBlock(chunk: ChunkSpec, rng: Random, cx: number, cz: number, B: number): void {
    const town = this.place?.town ?? this.terrain.main;
    // Skyline per region: the island is a wall of supertalls, the river metro stays low.
    const limit = town.kind === 'island' ? 0.75 : town.kind === 'metro' ? 0.22 : this.c.downtownFraction;
    const scale = town.kind === 'island' ? 1.5 : town.kind === 'metro' ? 0.6 : 1;
    const t = clamp(this.terrain.townFraction(town, cx, cz) / limit, 0, 1);
    const hc = this.c.towerHeightCenter;
    const he = this.c.towerHeightEdge;
    const height = () => rng.range(lerp(hc.min, he.min, t), lerp(hc.max, he.max, t)) * scale;
    // Mix of blue-teal glass towers and warm stone ones (the island is mostly glass).
    const glass = town.kind === 'island' ? 0.85 : town.kind === 'metro' ? 0.3 : 0.6;
    const color = () => rng.chance(glass)
      ? hsl(rng.range(0.52, 0.6), rng.range(0.12, 0.3), rng.range(0.5, 0.72))
      : hsl(rng.range(0.07, 0.12), rng.range(0.15, 0.32), rng.range(0.6, 0.8));
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
      // The river metro is brick and pale stone; elsewhere warm render with a few pastels.
      const metro = this.place?.town?.kind === 'metro';
      const color = metro
        ? rng.chance(0.5) ? hsl(rng.range(0.02, 0.06), rng.range(0.3, 0.45), rng.range(0.4, 0.55)) : hsl(rng.range(0.1, 0.13), rng.range(0.15, 0.3), rng.range(0.72, 0.85))
        : rng.chance(0.8)
        ? hsl(rng.range(0.03, 0.12), rng.range(0.2, 0.42), rng.range(0.55, 0.8))
        : hsl(rng.range(0.3, 0.55), rng.range(0.15, 0.3), rng.range(0.55, 0.75));
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
            part('tree', tx, 0, tz, s, s, s, rng.range(0, Math.PI * 2), rng.pick(COLORS.autumn)),
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

  private cars(chunk: ChunkSpec, d: UrbanDistrict, rng: Random, x0: number, z0: number): void {
    const density = this.c.carDensity[d];
    const S = this.chunkSize;
    const W = this.c.streetWidth;
    const lane = W / 2 - 3.5;
    const isCrossing = (t: number) => t < W / 2 + 4 || Math.abs(t - this.pitch) < W / 2 + 4 || t > S - 6;
    const vehicle = (x: number, z: number, rot: number) => {
      const r = rng.next();
      let pool: PoolId = 'car';
      let [w, h, l] = [1.9, 1.5, 4.5];
      let color = hsl(rng.next(), rng.range(0.2, 0.7), rng.range(0.3, 0.7));
      if (r < 0.1) {
        // Box truck, or now and then a bus.
        pool = 'truck';
        [w, h, l] = r < 0.03 ? [2.5, 3.2, 12] : [2.3, 3, 7.5];
      } else if (r < 0.3) {
        [w, h, l] = [2, 1.8, 4.8]; // SUV / van
      } else if (r < 0.36) {
        color = 0xe8b923; // taxi
      }
      this.add(chunk, 'car', x, z, w / 2, l / 2, h, rot, [part(pool, x, 0, z, w, h, l, rot, color)]);
    };
    for (const o of [0, this.pitch]) {
      for (const side of [-1, 1]) {
        for (let t = rng.range(0, 12); t < S; t += 100 / density * rng.range(0.4, 1.6)) {
          if (isCrossing(t)) continue;
          // Street along z (at x = x0 + o) and along x (at z = z0 + o).
          const ax = x0 + o + side * lane;
          const az = z0 + t;
          vehicle(ax, az, side > 0 ? 0 : Math.PI);
          vehicle(x0 + t, z0 + o + side * lane, side > 0 ? -Math.PI / 2 : Math.PI / 2);
        }
      }
    }
  }

  private add(chunk: ChunkSpec, kind: StructureKind, x: number, z: number, halfW: number, halfD: number, height: number, rotY: number, parts: PartSpec[], y = 0): void {
    chunk.structures.push({ kind, size: SIZE_OF[kind], x, z, y, halfW, halfD, height, rotY, parts } satisfies StructureSpec);
  }
}

// ------------------------------------------------------------- helpers

function withY([x, z]: [number, number], y: number): [number, number, number] {
  return [x, y, z];
}

function range(rng: Random, r: Range): number {
  return rng.range(r.min, r.max);
}
