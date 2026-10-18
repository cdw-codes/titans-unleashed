import { REGIONS, type RegionsConfig } from '../../config/regions';
import { smoothstep } from '../../core/math';
import type { Terrain, Town } from '../terrain/Terrain';
import { flat, part } from './parts';
import { SIZE_OF, type PartSpec, type StructureKind, type StructureSpec } from './types';

/** Street color (the minimap draws flats of this color as roads). */
export const ROAD_COLOR = 0x46474b;

const COL = {
  deck: 0x55575b,
  steel: 0x8e959c,
  cable: 0x5c6670,
  runway: 0x3a3b3e,
  taxiway: 0x56575b,
  marking: 0xf2f2ee,
  apron: 0xa6a59e,
  concrete: 0xb3b0a6,
  white: 0xf1f0ec,
  signal: 0xd9512c,
  reactor: 0xd8d6cf,
  glass: 0x5d7f99,
  pitch: 0x5f9e4a,
  seats: 0x9aa3ad,
};

export interface SiteContent {
  structures: StructureSpec[];
  flats: PartSpec[];
}

interface Reserve {
  x: number;
  z: number;
  r: number;
}

/**
 * Hand-placed set pieces from regions.ts, built once as world-space data and
 * handed out per chunk (each piece belongs to the chunk holding its center):
 * the suspension bridge to the island, the airport, the coastal power station,
 * and the main city's broadcast tower and stadium. Original designs only.
 */
export class Sites {
  private content: SiteContent | null = null;
  private readonly reserves: Reserve[] = [];

  constructor(
    private readonly terrain: Terrain,
    private readonly pitch: number,
    private readonly r: RegionsConfig = REGIONS,
  ) {}

  /** Pieces whose centers fall inside the square [x0, x0 + size) x [z0, z0 + size). */
  forChunk(x0: number, z0: number, size: number): SiteContent {
    const all = this.all();
    const inside = (x: number, z: number) => x >= x0 && x < x0 + size && z >= z0 && z < z0 + size;
    return {
      structures: all.structures.filter((s) => inside(s.x, s.z)),
      flats: all.flats.filter((f) => inside(f.x, f.z)),
    };
  }

  /** True when a landmark stands here and ordinary blocks should leave room. */
  isReserved(x: number, z: number, radius: number): boolean {
    this.all();
    return this.reserves.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + radius);
  }

  private all(): SiteContent {
    if (this.content) return this.content;
    const c: SiteContent = { structures: [], flats: [] };
    this.content = c;
    this.bridge(c);
    const airport = this.terrain.authored.find((t) => t.kind === 'airport');
    if (airport) this.airport(c, airport);
    const plant = this.terrain.authored.find((t) => t.kind === 'plant');
    if (plant) this.powerPlant(c, plant);
    this.broadcastTower(c);
    this.stadium(c);
    return c;
  }

  private add(c: SiteContent, kind: StructureKind, x: number, z: number, y: number, halfW: number, halfD: number, height: number, rotY: number, parts: PartSpec[]): void {
    c.structures.push({ kind, size: SIZE_OF[kind], x, z, y, halfW, halfD, height, rotY, parts });
  }

  // ------------------------------------------------------------ bridge

  /** Suspension bridge across the strait from the main city to the island. */
  private bridge(c: SiteContent): void {
    const t = this.terrain;
    const z = this.r.island.bridgeZ;
    const xa = t.coastX(z) - 40;
    let xb = xa + 100;
    while (xb < xa + 4000 && t.islandWeight(xb, z) < 0.97) xb += 10;
    xb += 40;
    const L = xb - xa;
    const deckH = 42;
    const ramp = Math.min(240, L * 0.3);
    const deckY = (u: number) => 1 + deckH * smoothstep(0, ramp, u) * smoothstep(L, L - ramp, u);
    const p1 = L * 0.24;
    const p2 = L * 0.76;
    const top = deckH + 125;
    // Main cables: anchors at the deck ends, over both pylon tops, sagging between.
    const cableY = (u: number): number => {
      if (u < p1) return deckY(u) + 4 + ((top - deckY(u) - 4) * u) / p1;
      if (u > p2) return deckY(u) + 4 + ((top - deckY(u) - 4) * (L - u)) / (L - p2);
      const k = (u - p1) / (p2 - p1);
      return top - (top - deckH - 8) * 4 * k * (1 - k);
    };
    const seg = 32;
    const n = Math.ceil(L / seg);
    const W = 28;
    for (let i = 0; i < n; i++) {
      const u0 = i * seg;
      const u1 = Math.min(L, u0 + seg);
      const um = (u0 + u1) / 2;
      const x = xa + um;
      const y0 = deckY(u0);
      const y1 = deckY(u1);
      const tilt = -Math.atan2(y1 - y0, u1 - u0);
      const parts: PartSpec[] = [
        part('plain', x, (y0 + y1) / 2 - 2.5, z, W, 2.5, u1 - u0 + 0.6, Math.PI / 2, COL.deck, tilt),
      ];
      for (const side of [-1, 1]) {
        const zc = z + side * (W / 2 - 1);
        const c0 = cableY(u0);
        const c1 = cableY(u1);
        const len = Math.hypot(u1 - u0, c1 - c0);
        parts.push(part('plain', x, (c0 + c1) / 2 - 0.8, zc, 1.6, 1.6, len + 0.4, Math.PI / 2, COL.cable, -Math.atan2(c1 - c0, u1 - u0)));
        const hang = cableY(um) - deckY(um);
        if (hang > 3) parts.push(part('plain', x, deckY(um), zc, 0.6, hang, 0.6, 0, COL.cable));
      }
      this.add(c, 'bridge', x, z, deckY(um) - 2.5, (u1 - u0) / 2, W / 2, Math.max(4, cableY(um) - deckY(um) + 4), 0, parts);
    }
    for (const u of [p1, p2]) {
      const x = xa + u;
      const base = Math.min(t.heightAt(x, z), 0);
      const h = top + 6 - base;
      const parts: PartSpec[] = [];
      for (const side of [-1, 1]) parts.push(part('plain', x, base, z + side * 15, 8, h, 8, 0, COL.steel));
      for (const yy of [deckH - 6, top - 30, top - 2]) parts.push(part('plain', x, yy, z, 6, 6, 36, 0, COL.steel));
      this.add(c, 'pylon', x, z, base, 5, 19, h, 0, parts);
    }
  }

  // ------------------------------------------------------------ airport

  private airport(c: SiteContent, a: Town): void {
    const ax = a.x;
    const az = a.z;
    const piece = 128;
    // Two parallel runways (east-west) with center-line dashes, a taxiway and the apron.
    const strip = (zc: number, len: number, width: number, color: number, y: number) => {
      for (let x = -len / 2; x < len / 2; x += piece) {
        const w = Math.min(piece, len / 2 - x);
        c.flats.push(flat(ax + x + w / 2, zc, w, width, color, y));
      }
    };
    for (const [zc, len] of [[az - 200, 1100], [az + 20, 900]] as const) {
      strip(zc, len, 55, COL.runway, 0.03);
      for (let x = -len / 2 + 40; x < len / 2 - 40; x += 70) c.flats.push(flat(ax + x, zc, 32, 2, COL.marking, 0.05));
      for (const end of [-1, 1]) {
        for (let k = -3; k <= 3; k++) c.flats.push(flat(ax + end * (len / 2 - 20), zc + k * 6.5, 26, 3, COL.marking, 0.05));
      }
    }
    strip(az + 130, 950, 24, COL.taxiway, 0.03);
    for (let zz = az + 160; zz < az + 330; zz += 110) strip(zz + 55, 800, 110, COL.apron, 0.02);

    // Terminal (three sections), control tower, hangars.
    for (const k of [-1, 0, 1]) {
      const x = ax + k * 170;
      const z = az + 380;
      this.add(c, 'terminal', x, z, 0, 80, 24, 30, 0, [
        part('windowed', x, 0, z, 160, 22, 48, 0, COL.glass),
        part('plain', x, 22, z, 168, 4, 54, 0, COL.white),
      ]);
    }
    {
      const x = ax - 340;
      const z = az + 300;
      this.add(c, 'mast', x, z, 0, 9, 9, 86, 0, [
        part('cone', x, 0, z, 16, 70, 16, 0, COL.white),
        part('cylinder', x, 70, z, 22, 10, 22, 0, COL.glass),
        part('cylinder', x, 80, z, 24, 2, 24, 0, COL.white),
        part('cylinder', x, 82, z, 1.5, 12, 1.5, 0, COL.signal),
      ]);
    }
    for (const k of [0, 1, 2]) {
      const x = ax + 320 + k * 105;
      const z = az + 300;
      if (Math.hypot(x - ax, z - az) > a.radius - 40) continue;
      this.add(c, 'warehouse', x, z, 0, 45, 35, 34, 0, [
        part('plain', x, 0, z, 90, 22, 70, 0, 0xc9ccce),
        part('roof', x, 22, z, 92, 12, 70, Math.PI / 2, 0x8c949b),
      ]);
    }
    // Airliners parked at the apron, one lined up on the runway.
    const liveries = [0xffffff, 0xeef3ff, 0xfff4ea, 0xeaf4ec, 0xf6eef6];
    let li = 0;
    for (let x = ax - 330; x <= ax + 230; x += 95) {
      const z = az + 250;
      this.add(c, 'plane', x, z, 0, 26, 30, 14, Math.PI, [part('plane', x, 0, z, 60, 60, 60, Math.PI, liveries[li++ % liveries.length]!)]);
    }
    this.add(c, 'plane', ax - 470, az - 200, 0, 30, 26, 14, Math.PI / 2, [part('plane', ax - 470, 0, az - 200, 60, 60, 60, Math.PI / 2, 0xffffff)]);
  }

  // ------------------------------------------------------------ power station

  private powerPlant(c: SiteContent, p: Town): void {
    const px = p.x;
    const pz = p.z;
    const piece = 120;
    for (let x = -p.radius; x < p.radius; x += piece) {
      for (let z = -p.radius; z < p.radius; z += piece) {
        if (Math.hypot(x + piece / 2, z + piece / 2) < p.radius - 30) c.flats.push(flat(px + x + piece / 2, pz + z + piece / 2, piece, piece, COL.concrete, 0.02));
      }
    }
    for (const dz of [-90, 90]) {
      const x = px + 110;
      const z = pz + dz;
      this.add(c, 'reactor', x, z, 0, 24, 24, 68, 0, [
        part('cylinder', x, 0, z, 48, 42, 48, 0, COL.reactor),
        part('dome', x, 42, z, 48, 26, 48, 0, COL.reactor),
      ]);
    }
    this.add(c, 'warehouse', px - 10, pz, 0, 70, 25, 34, 0, [
      part('plain', px - 10, 0, pz, 140, 30, 50, 0, 0xc4c8cc),
      part('plain', px - 10, 30, pz, 120, 4, 40, 0, 0x8c949b),
    ]);
    for (const dz of [-150, 140]) {
      const x = px - 190;
      const z = pz + dz;
      this.add(c, 'reactor', x, z, 0, 45, 45, 130, 0, [part('cooling', x, 0, z, 90, 130, 90, 0, 0xcfccc4)]);
    }
    const sx = px - 40;
    const sz = pz + 175;
    this.add(c, 'chimney', sx, sz, 0, 5, 5, 160, 0, [
      part('cylinder', sx, 0, sz, 10, 120, 10, 0, COL.white),
      part('cylinder', sx, 120, sz, 10, 20, 10, 0, COL.signal),
      part('cylinder', sx, 140, sz, 10, 20, 10, 0, COL.white),
    ]);
  }

  // ------------------------------------------------------------ main city landmarks

  /** Original lattice-free broadcast tower: tapering shaft, two observation decks, antenna. */
  private broadcastTower(c: SiteContent): void {
    const b = this.r.broadcastTower;
    const [x, z] = this.blockCenter(b.x, b.z);
    const h = b.height;
    this.reserves.push({ x, z, r: 40 });
    const parts: PartSpec[] = [
      part('cone', x, 0, z, 64, 22, 64, 0, COL.white),
      part('cone', x, 22, z, 30, 80, 30, 0, COL.signal),
      part('cone', x, 102, z, 21, 70, 21, 0, COL.white),
      part('cylinder', x, 150, z, 46, 16, 46, 0, COL.glass),
      part('cone', x, 172, z, 15, 70, 15, 0, COL.signal),
      part('cylinder', x, 238, z, 26, 9, 26, 0, COL.glass),
      part('cylinder', x, 247, z, 3, h - 247, 3, 0, COL.white),
    ];
    this.add(c, 'mast', x, z, 0, 22, 22, h, 0, parts);
  }

  private stadium(c: SiteContent): void {
    const s = this.r.stadium;
    const x = Math.round(s.x / this.pitch) * this.pitch;
    const z = Math.round(s.z / this.pitch) * this.pitch;
    const ra = 125;
    const rb = 95;
    this.reserves.push({ x, z, r: 120 });
    const parts: PartSpec[] = [flat(x, z, 150, 105, COL.pitch, 0.06)];
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * ra;
      const pz = z + Math.sin(a) * rb;
      // Tangent direction of the ellipse sets the wall segment's yaw.
      const yaw = Math.atan2(-Math.sin(a) * ra, Math.cos(a) * rb);
      const seg = ((Math.PI * 2 * (ra + rb)) / 2 / n) * 1.12;
      parts.push(part('plain', px, 0, pz, 18, 34, seg, yaw, i % 2 ? COL.seats : 0xb0b8c0));
    }
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const lx = x + dx * (ra + 4);
      const lz = z + dz * (rb + 4);
      parts.push(part('cylinder', lx, 0, lz, 3, 62, 3, 0, COL.steel));
      parts.push(part('plain', lx, 62, lz, 14, 7, 3, Math.atan2(dx, dz), COL.white));
    }
    this.add(c, 'stadium', x, z, 0, ra + 9, rb + 9, 34, 0, parts.filter((p) => p.pool !== 'flat'));
    c.flats.push(parts[0]!);
  }

  /** Center of the city block nearest to a point (blocks sit between the streets). */
  private blockCenter(x: number, z: number): [number, number] {
    const p = this.pitch;
    const snap = (v: number) => Math.round((v - p / 2) / p) * p + p / 2;
    return [snap(x), snap(z)];
  }
}
