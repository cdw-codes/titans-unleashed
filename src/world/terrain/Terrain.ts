import { clamp, hashCoords, lerp, noise2D } from '../../core/math';
import { Random } from '../../core/random';
import { TERRAIN, TERRAIN_COLORS as COL, type TerrainConfig } from '../../config/terrain';

export type TownKind = 'city' | 'village' | 'works' | 'port';

export interface Town {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly kind: TownKind;
}

/** Countryside type of a chunk (towns use city districts instead). */
export type Biome = 'forest' | 'farmland' | 'meadow';

/** Heights and colors sampled on a (n+1)² grid over one chunk, row-major (z rows, x columns). */
export interface TerrainTileData {
  readonly n: number;
  readonly heights: Float32Array;
  /** sRGB 0..1 triples per sample. */
  readonly colors: Float32Array;
}

const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Three octaves of value noise, rotated per octave to hide the grid. Roughly 0..1. */
function fbm(x: number, z: number, seed: number): number {
  let sum = noise2D(x, z, seed) * 0.57;
  sum += noise2D(x * 1.6 + z * 1.2 + 5.3, z * 1.6 - x * 1.2 - 2.1, seed + 1) * 0.29;
  sum += noise2D(x * 2.5 - z * 2.9 - 9.7, z * 2.5 + x * 2.9 + 4.4, seed + 2) * 0.14;
  return sum;
}

const _rgb = [0, 0, 0];

/**
 * Deterministic world shape: one height function (`heightAt`) that every system
 * samples, so visuals, colliders, spawns and units agree. Towns are flat at y = 0;
 * hills rise between them; lakes and the sea are where the ground dips below
 * `waterLevel`. Pure (no three.js), so it is unit-tested and cheap to call.
 */
export class Terrain {
  private readonly townCache = new Map<number, Town | null>();
  readonly main: Town;

  constructor(readonly c: TerrainConfig = TERRAIN) {
    this.main = { x: 0, z: 0, radius: c.mainCityRadius, kind: 'city' };
  }

  get waterLevel(): number {
    return this.c.waterLevel;
  }

  /** Coastline x at this z (sea to the east). */
  coastX(z: number): number {
    const c = this.c;
    const s = 1 / c.coastWaveSize;
    return c.coastX + (noise2D(z * s, 0.5, c.seed + 11) - 0.5) * 2 * c.coastWave + (noise2D(z * s * 4, 3.5, c.seed + 12) - 0.5) * c.coastWave * 0.35;
  }

  /** Westmost the coast can reach: safe inland bound for spawns. */
  get minCoastX(): number {
    return this.c.coastX - this.c.coastWave * 1.2;
  }

  /** The satellite town in grid cell (i, j), if any. */
  townInCell(i: number, j: number): Town | null {
    const key = (i + 32768) * 65536 + (j + 32768);
    const cached = this.townCache.get(key);
    if (cached !== undefined) return cached;
    const town = this.makeTown(i, j);
    this.townCache.set(key, town);
    return town;
  }

  private makeTown(i: number, j: number): Town | null {
    const c = this.c;
    const rng = new Random(hashCoords(i, j, c.seed + 101));
    if (!rng.chance(c.townChance)) return null;
    const x = (i + rng.range(0.25, 0.75)) * c.townCell;
    const z = (j + rng.range(0.25, 0.75)) * c.townCell;
    const radius = rng.range(c.townRadius.min, c.townRadius.max);
    if (Math.hypot(x, z) < c.mainCityRadius + c.townGap + radius) return null;
    const coast = this.coastX(z);
    if (x > coast - radius * 0.6) return null;
    const kind: TownKind = x > coast - radius - 350 ? 'port' : rng.chance(c.worksChance) ? 'works' : 'village';
    return { x, z, radius, kind };
  }

  /** Visit the main city and the satellite towns that could reach (x, z). */
  forTownsNear(x: number, z: number, cb: (t: Town, dist: number) => void): void {
    cb(this.main, Math.hypot(x, z));
    const cell = this.c.townCell;
    const ci = Math.floor(x / cell);
    const cj = Math.floor(z / cell);
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const t = this.townInCell(i, j);
        if (t) cb(t, Math.hypot(x - t.x, z - t.z));
      }
    }
  }

  /** The town whose edge is closest (negative = inside), with the distance to its center. */
  nearestTown(x: number, z: number): { town: Town; dist: number } {
    let best = this.main;
    let bestDist = Math.hypot(x, z);
    let bestEdge = bestDist - best.radius;
    this.forTownsNear(x, z, (t, d) => {
      if (d - t.radius < bestEdge) {
        best = t;
        bestDist = d;
        bestEdge = d - t.radius;
      }
    });
    return { town: best, dist: bestDist };
  }

  /** 1 on flat town ground, 0 in open country. */
  urbanWeight(x: number, z: number): number {
    const c = this.c;
    let u = 0;
    this.forTownsNear(x, z, (t, d) => {
      const flat = t.radius + c.flatMargin;
      u = Math.max(u, 1 - smoothstep(flat, flat + c.blendWidth, d));
    });
    return u;
  }

  /** True when the whole square is town ground (inside a town's radius). */
  isTownSquare(x0: number, z0: number, size: number): Town | null {
    const { town } = this.nearestTown(x0 + size / 2, z0 + size / 2);
    for (const [x, z] of [[x0, z0], [x0 + size, z0], [x0, z0 + size], [x0 + size, z0 + size]] as const) {
      if (Math.hypot(x - town.x, z - town.z) > town.radius) return null;
    }
    return town;
  }

  /** Open-country relief before towns, lakes and the coast shape it. */
  private hills(x: number, z: number): number {
    const c = this.c;
    const n = fbm(x / c.hillSize, z / c.hillSize, c.seed);
    const rolling = Math.pow(clamp(n, 0, 1), 1.6) * c.hillHeight;
    const r = smoothstep(c.ridgeStart, 0.95, noise2D(x / c.ridgeSize + 31.7, z / c.ridgeSize - 12.9, c.seed + 5));
    const detail = noise2D(x / c.detailSize, z / c.detailSize, c.seed + 9) * c.detailHeight;
    return 1.5 + rolling + r * r * c.ridgeHeight + detail;
  }

  lakeWeight(x: number, z: number): number {
    const c = this.c;
    const s = 1 / c.lakeSize;
    const l = noise2D(x * s + 17.3, z * s - 4.1, c.seed + 21) * 0.75 + noise2D(x * s * 2.3 - z * s * 1.4, z * s * 2.3 + x * s * 1.4, c.seed + 22) * 0.25;
    return smoothstep(c.lakeThreshold, c.lakeThreshold + 0.07, l);
  }

  /** Ground height (m) at a world position. */
  heightAt(x: number, z: number): number {
    const c = this.c;
    const u = this.urbanWeight(x, z);
    let h = u < 1 ? this.hills(x, z) * (1 - u) : 0;
    const lake = this.lakeWeight(x, z) * (1 - u);
    if (lake > 0) h = lerp(h, -c.lakeDepth, lake);
    const dx = x - this.coastX(z);
    if (dx > -2 * c.beachWidth) {
      h = lerp(h, Math.min(h, 1), smoothstep(-2 * c.beachWidth, -c.beachWidth * 0.2, dx));
      h = lerp(h, -c.seaDepth, smoothstep(0, c.shelfWidth, dx));
    }
    return h;
  }

  /** Is this point under the sea or a lake? */
  isWater(x: number, z: number, margin = 0): boolean {
    return this.heightAt(x, z) < this.c.waterLevel + margin;
  }

  isSea(x: number, z: number): boolean {
    return x > this.coastX(z);
  }

  /** 0..1 forest density (0 in towns and water). */
  forestDensity(x: number, z: number): number {
    const c = this.c;
    const f = fbm(x / c.forestSize + 70.1, z / c.forestSize - 33.3, c.seed + 31);
    return smoothstep(c.forestThreshold - 0.03, c.forestThreshold + 0.14, f);
  }

  farmWeight(x: number, z: number): number {
    const c = this.c;
    return smoothstep(c.farmThreshold, c.farmThreshold + 0.06, noise2D(x / c.farmSize - 50.5, z / c.farmSize + 8.8, c.seed + 41));
  }

  biomeAt(x: number, z: number): Biome {
    if (this.forestDensity(x, z) > 0.35) return 'forest';
    if (this.farmWeight(x, z) > 0.5) return 'farmland';
    return 'meadow';
  }

  /**
   * Sample one chunk's heights and colors on an n x n cell grid. `pitch` is the
   * street pitch (country roads follow the street grid).
   */
  buildTile(x0: number, z0: number, size: number, n: number, pitch: number): TerrainTileData {
    const m = n + 1;
    const step = size / n;
    const heights = new Float32Array(m * m);
    const colors = new Float32Array(m * m * 3);
    // One extra sample ring for slopes at the edges.
    const ext = (i: number, j: number) => this.heightAt(x0 + i * step, z0 + j * step);
    const ring = new Float32Array((m + 2) * (m + 2));
    for (let j = -1; j <= m; j++) for (let i = -1; i <= m; i++) ring[(j + 1) * (m + 2) + i + 1] = ext(i, j);
    const at = (i: number, j: number) => ring[(j + 1) * (m + 2) + i + 1]!;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        const h = at(i, j);
        heights[j * m + i] = h;
        const slope = Math.hypot(at(i + 1, j) - at(i - 1, j), at(i, j + 1) - at(i, j - 1)) / (2 * step);
        this.colorAt(x0 + i * step, z0 + j * step, h, slope, pitch, _rgb);
        colors.set(_rgb, (j * m + i) * 3);
      }
    }
    return { n, heights, colors };
  }

  /** Ground color (sRGB 0..1) for a point with known height and slope. */
  colorAt(x: number, z: number, h: number, slope: number, pitch: number, out: number[]): number[] {
    const c = this.c;
    const wl = c.waterLevel;
    if (h < wl + 2.2) {
      // Shore sand, darkening toward the bed under the water.
      return mixHex(COL.sand, COL.seabed, smoothstep(wl - 0.5, wl - 12, h), out);
    }
    const u = this.urbanWeight(x, z);
    const vary = noise2D(x / 260, z / 260, c.seed + 51);
    // Base: green grass blending into golden meadow (like late-summer hills).
    mixHex(COL.grass, COL.meadow, smoothstep(0.4, 0.72, vary), out);
    mixInto(out, COL.grassDark, smoothstep(0.35, 0.05, vary) * 0.6);

    const farm = this.farmWeight(x, z) * (1 - u);
    if (farm > 0) {
      const fx = Math.floor(x / c.fieldSize);
      const fz = Math.floor(z / c.fieldSize);
      const crop = COL.crops[hashCoords(fx, fz, c.seed + 61) % COL.crops.length]!;
      mixInto(out, crop, farm * 0.9);
    }
    const forest = this.forestDensity(x, z) * (1 - u);
    if (forest > 0) {
      // Canopy speckle: what the forest looks like beyond the tree draw radius.
      const pick = COL.canopy[hashCoords(Math.floor(x / 16), Math.floor(z / 16), c.seed + 71) % COL.canopy.length]!;
      mixInto(out, pick, forest * 0.85);
    }
    if (u > 0) mixInto(out, COL.town, u * 0.8);

    // Country roads on the street grid, outside towns.
    const every = pitch * c.countryRoadEvery;
    const rx = Math.abs(x - Math.round(x / every) * every);
    const rz = Math.abs(z - Math.round(z / every) * every);
    const road = (1 - smoothstep(6, 14, Math.min(rx, rz))) * (1 - u);
    if (road > 0) mixInto(out, COL.road, road * 0.85);

    const rock = Math.max(smoothstep(c.rockSlope, c.rockSlope + 0.25, slope), smoothstep(c.rockHeight, c.rockHeight + 60, h));
    if (rock > 0) mixInto(out, vary > 0.5 ? COL.rock : COL.rockDark, rock);
    // Low ground just above the water: a hint of sand.
    mixInto(out, COL.sand, smoothstep(wl + 5, wl + 2.2, h) * 0.7);
    return out;
  }
}

function hexR(hex: number): number {
  return ((hex >> 16) & 255) / 255;
}
function hexG(hex: number): number {
  return ((hex >> 8) & 255) / 255;
}
function hexB(hex: number): number {
  return (hex & 255) / 255;
}

function mixHex(a: number, b: number, t: number, out: number[]): number[] {
  out[0] = lerp(hexR(a), hexR(b), t);
  out[1] = lerp(hexG(a), hexG(b), t);
  out[2] = lerp(hexB(a), hexB(b), t);
  return out;
}

function mixInto(out: number[], hex: number, t: number): void {
  if (t <= 0) return;
  out[0] = lerp(out[0]!, hexR(hex), t);
  out[1] = lerp(out[1]!, hexG(hex), t);
  out[2] = lerp(out[2]!, hexB(hex), t);
}

/** Shared world terrain (deterministic from config). */
export const terrain = new Terrain();
