import { clamp, hashCoords, lerp, noise2D } from '../../core/math';
import { Random } from '../../core/random';
import { TERRAIN, TERRAIN_COLORS as COL, type TerrainConfig } from '../../config/terrain';
import { REGIONS, type RegionsConfig } from '../../config/regions';
import { CITY } from '../../config/city';
import { LAND } from '../maps/format';
import { generateRegions } from './regionsGen';
import type { CityMap } from '../maps/CityMap';

/**
 * city: the main city · metro: river city · island: offshore supertall island ·
 * airport / plant: flat sites without a street grid · village / works / port: satellites.
 */
export type TownKind = 'city' | 'metro' | 'island' | 'airport' | 'plant' | 'village' | 'works' | 'port';

export interface Town {
  readonly x: number;
  readonly z: number;
  /** Circle radius, or the half-width of an ellipse. */
  readonly radius: number;
  readonly kind: TownKind;
  /** Region name shown on entry (authored places only). */
  readonly name?: string;
  /** Elliptical towns: long half-axis and rotation of the long axis from north-south. */
  readonly ellipse?: { readonly halfLength: number; readonly angle: number };
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
  /** Hand-placed towns and sites (regions.ts), checked before the satellite grid. Empty on city maps. */
  authored: readonly Town[];
  /** A real city map (OSM) replaces the procedural layout when set. */
  map: CityMap | null = null;
  /** Where the player starts. */
  spawn: { x: number; z: number } = { x: CITY.spawnX, z: CITY.spawnZ };
  island!: Town;
  /** Per-river bounding boxes (with bank margin) to skip far rivers cheaply. */
  private riverBoxes: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  /** World seed; the classic hand-made layout uses TERRAIN.seed. */
  get seed(): number {
    return this.c.seed;
  }

  constructor(public c: TerrainConfig = TERRAIN, public r: RegionsConfig = REGIONS) {
    this.main = { x: 0, z: 0, radius: c.mainCityRadius, kind: 'city', name: r.mainName };
    this.authored = [];
    this.buildLayout();
  }

  /**
   * A new open world: noise, satellite towns and the placement of every region
   * come from `seed` (call before any chunk is generated).
   */
  reseed(seed: number): void {
    this.c = { ...this.c, seed };
    this.r = generateRegions(seed, (z) => this.coastX(z));
    this.townCache.clear();
    this.buildLayout();
    this.spawn = this.findSpawn();
  }

  private buildLayout(): void {
    const r = this.r;
    const isl = r.island;
    this.island = { x: isl.x, z: isl.z, radius: isl.halfWidth, kind: 'island', name: isl.name, ellipse: { halfLength: isl.halfLength, angle: isl.angle } };
    const margin = 900;
    this.riverBoxes = r.rivers.map((rv) => ({
      minX: Math.min(...rv.points.map((p) => p[0])) - margin,
      maxX: Math.max(...rv.points.map((p) => p[0])) + margin,
      minZ: Math.min(...rv.points.map((p) => p[1])) - margin,
      maxZ: Math.max(...rv.points.map((p) => p[1])) + margin,
    }));
    const pp = r.powerPlant;
    this.authored = [
      this.main,
      this.island,
      { x: r.riverCity.x, z: r.riverCity.z, radius: r.riverCity.radius, kind: 'metro', name: r.riverCity.name },
      { x: r.airport.x, z: r.airport.z, radius: r.airport.radius, kind: 'airport', name: r.airport.name },
      { x: this.coastX(pp.z) - pp.inland - pp.radius, z: pp.z, radius: pp.radius, kind: 'plant', name: pp.name },
    ];
  }

  /** A street intersection in the main city: dry, off the river, clear of the landmarks. */
  findSpawn(): { x: number; z: number } {
    const pitch = CITY.blockSize + CITY.streetWidth;
    const { broadcastTower: t, stadium: st } = this.r;
    for (let ring = 0; ring <= 8; ring++) {
      for (let i = -ring; i <= ring; i++) {
        for (const [a, b] of [[i, -ring], [i, ring], [-ring, i], [ring, i]] as const) {
          const x = CITY.spawnX + a * pitch;
          const z = CITY.spawnZ + b * pitch;
          if (this.isWater(x, z, 3) || this.riverDistance(x, z) < 220) continue;
          if (Math.hypot(x - t.x, z - t.z) < 150 || Math.hypot(x - st.x, z - st.z) < 260) continue;
          return { x, z };
        }
      }
    }
    return { x: CITY.spawnX, z: CITY.spawnZ };
  }

  /** Switch to a real city map (call before any chunk is generated). */
  setMap(map: CityMap): void {
    this.map = map;
    this.authored = [];
    this.townCache.clear();
    this.spawn = { ...map.meta.spawn };
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
    if (this.map) return Infinity;
    return this.c.coastX - this.c.coastWave * 1.2;
  }

  /** Signed distance (m) from a town's boundary: negative inside. Ellipses are approximate. */
  townEdge(t: Town, x: number, z: number): number {
    const dx = x - t.x;
    const dz = z - t.z;
    if (!t.ellipse) return Math.hypot(dx, dz) - t.radius;
    const cs = Math.cos(t.ellipse.angle);
    const sn = Math.sin(t.ellipse.angle);
    const lx = dx * cs - dz * sn;
    const lz = dx * sn + dz * cs;
    return (Math.hypot(lx / t.radius, lz / t.ellipse.halfLength) - 1) * t.radius;
  }

  /** 0 at a town's center, 1 at its edge (used to lay out districts). */
  townFraction(t: Town, x: number, z: number): number {
    return 1 + this.townEdge(t, x, z) / t.radius;
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
    if (this.map) return null;
    const c = this.c;
    const rng = new Random(hashCoords(i, j, c.seed + 101));
    if (!rng.chance(c.townChance)) return null;
    const x = (i + rng.range(0.25, 0.75)) * c.townCell;
    const z = (j + rng.range(0.25, 0.75)) * c.townCell;
    const radius = rng.range(c.townRadius.min, c.townRadius.max);
    for (const a of this.authored) {
      const gap = a === this.main ? c.townGap : this.r.clearance;
      if (this.townEdge(a, x, z) < gap + radius) return null;
    }
    // Not in the mountains or on a river.
    if (this.alpsWeight(z) > 0.05 || this.riverDistance(x, z) < radius + 150) return null;
    const coast = this.coastX(z);
    if (x > coast - radius * 0.6) return null;
    const kind: TownKind = x > coast - radius - 350 ? 'port' : rng.chance(c.worksChance) ? 'works' : 'village';
    return { x, z, radius, kind };
  }

  /** Visit authored towns and the satellite towns that could reach (x, z), with edge distances. */
  forTownsNear(x: number, z: number, cb: (t: Town, edge: number) => void): void {
    for (const t of this.authored) cb(t, this.townEdge(t, x, z));
    const cell = this.c.townCell;
    const ci = Math.floor(x / cell);
    const cj = Math.floor(z / cell);
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const t = this.townInCell(i, j);
        if (t) cb(t, Math.hypot(x - t.x, z - t.z) - t.radius);
      }
    }
  }

  /** The town whose edge is closest, with that signed edge distance (negative = inside). */
  nearestTown(x: number, z: number): { town: Town; edge: number } {
    let best = this.main;
    let bestEdge = Infinity;
    this.forTownsNear(x, z, (t, e) => {
      if (e < bestEdge) {
        best = t;
        bestEdge = e;
      }
    });
    return { town: best, edge: bestEdge };
  }

  /** 1 on flat town ground, 0 in open country. */
  urbanWeight(x: number, z: number): number {
    if (this.map) return this.mapUrban(x, z);
    const c = this.c;
    let u = 0;
    this.forTownsNear(x, z, (t, e) => {
      // The island is flattened by its own coastline instead.
      if (t.kind !== 'island') u = Math.max(u, 1 - smoothstep(c.flatMargin, c.flatMargin + c.blendWidth, e));
    });
    return u;
  }

  /** The town covering the whole square (all corners inside its boundary), if any. */
  isTownSquare(x0: number, z0: number, size: number): Town | null {
    const { town } = this.nearestTown(x0 + size / 2, z0 + size / 2);
    for (const [x, z] of [[x0, z0], [x0 + size, z0], [x0, z0 + size], [x0 + size, z0 + size]] as const) {
      if (this.townEdge(town, x, z) > 0) return null;
    }
    return town;
  }

  /** Named region at a point (authored places, the Alps), or null in open country. */
  regionAt(x: number, z: number): string | null {
    if (this.map) return this.map.placeAt(x, z);
    for (const t of this.authored) if (t.name && this.townEdge(t, x, z) < 250) return t.name;
    if (this.alpsWeight(z) > 0.3) return this.r.alps.name;
    return null;
  }

  /** 0 south of the Alps, 1 deep in them. */
  alpsWeight(z: number): number {
    const a = this.r.alps;
    return smoothstep(a.startZ, a.fullZ, z);
  }

  /** Distance (m) to the nearest river centerline. */
  riverDistance(x: number, z: number): number {
    let best = Infinity;
    this.r.rivers.forEach((r, i) => {
      if (this.nearRiverBox(i, x, z)) best = Math.min(best, this.distToRiver(r.points, x, z));
    });
    return best;
  }

  private nearRiverBox(i: number, x: number, z: number): boolean {
    const b = this.riverBoxes[i]!;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  private distToRiver(pts: readonly (readonly [number, number])[], x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const dx = bx - ax;
      const dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  }

  /** 1 in a river channel, fading over the banks (wider where the ground is high). */
  private riverWeight(x: number, z: number, h: number): number {
    let w = 0;
    for (let i = 0; i < this.r.rivers.length; i++) {
      if (!this.nearRiverBox(i, x, z)) continue;
      const r = this.r.rivers[i]!;
      const d = this.distToRiver(r.points, x, z);
      const bank = Math.min(600, 25 + Math.max(0, h) * 2.5); // stays inside the bounding-box margin
      w = Math.max(w, 1 - smoothstep(r.width / 2 - 15, r.width / 2 + bank, d));
    }
    return w;
  }

  /** 1 on the island (flat), fading to 0 over its beach. */
  islandWeight(x: number, z: number): number {
    return 1 - smoothstep(0, 200, this.townEdge(this.island, x, z));
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

  /** Sharp ridged peaks for the Alps (0..1). */
  private peaks(x: number, z: number): number {
    const s = this.r.alps.size;
    let sum = 0;
    let amp = 0.6;
    let f = 1 / s;
    for (let o = 0; o < 3; o++) {
      const n = noise2D(x * f + o * 13.1, z * f - o * 7.7, this.c.seed + 80 + o);
      sum += (1 - Math.abs(n * 2 - 1)) ** 2 * amp;
      amp *= 0.45;
      f *= 2.2;
    }
    return sum;
  }

  lakeWeight(x: number, z: number): number {
    const c = this.c;
    const s = 1 / c.lakeSize;
    const l = noise2D(x * s + 17.3, z * s - 4.1, c.seed + 21) * 0.75 + noise2D(x * s * 2.3 - z * s * 1.4, z * s * 2.3 + x * s * 1.4, c.seed + 22) * 0.25;
    return smoothstep(c.lakeThreshold, c.lakeThreshold + 0.07, l);
  }

  /** Ground height (m) at a world position. */
  heightAt(x: number, z: number): number {
    if (this.map) return this.mapHeight(this.map, x, z);
    const c = this.c;
    const u = this.urbanWeight(x, z);
    let h = u < 1 ? this.hills(x, z) * (1 - u) : 0;
    const alps = this.alpsWeight(z) * (1 - u);
    if (alps > 0) h += alps * this.peaks(x, z) * this.r.alps.height;
    const lake = this.lakeWeight(x, z) * (1 - u) * (1 - alps);
    if (lake > 0) h = lerp(h, -c.lakeDepth, lake);
    const dx = x - this.coastX(z);
    if (dx > -2 * c.beachWidth) {
      h = lerp(h, Math.min(h, 1), smoothstep(-2 * c.beachWidth, -c.beachWidth * 0.2, dx));
      h = lerp(h, -c.seaDepth, smoothstep(0, c.shelfWidth, dx));
    }
    const island = this.islandWeight(x, z);
    if (island > 0) h = lerp(h, 0, island);
    const river = this.riverWeight(x, z, h);
    if (river > 0) h = lerp(h, -this.r.riverDepth, river);
    return h;
  }

  /** Is this point under the sea, a lake or a river? */
  isWater(x: number, z: number, margin = 0): boolean {
    return this.heightAt(x, z) < this.c.waterLevel + margin;
  }

  isSea(x: number, z: number): boolean {
    if (this.map) return this.map.classAt(x, z) === LAND.sea;
    return x > this.coastX(z) && this.islandWeight(x, z) < 0.5;
  }

  /** 0..1 forest density (0 in towns and water). */
  forestDensity(x: number, z: number): number {
    if (this.map?.inside(x, z)) {
      const k = this.map.classAt(x, z);
      return k === LAND.forest ? 1 : k === LAND.park ? 0.6 : k === LAND.grass ? 0.1 : 0;
    }
    const c = this.c;
    const f = fbm(x / c.forestSize + 70.1, z / c.forestSize - 33.3, c.seed + 31);
    return smoothstep(c.forestThreshold - 0.03, c.forestThreshold + 0.14, f);
  }

  farmWeight(x: number, z: number): number {
    if (this.map?.inside(x, z)) return 0;
    const c = this.c;
    return smoothstep(c.farmThreshold, c.farmThreshold + 0.06, noise2D(x / c.farmSize - 50.5, z / c.farmSize + 8.8, c.seed + 41));
  }

  biomeAt(x: number, z: number): Biome {
    if (this.forestDensity(x, z) > 0.35) return 'forest';
    if (this.farmWeight(x, z) > 0.5) return 'farmland';
    return 'meadow';
  }

  // ---------------------------------------------------------------- city maps

  /** Flat city at 0, channels under rivers and the sea; procedural hills rise outside the map. */
  private mapHeight(map: CityMap, x: number, z: number): number {
    const out = map.outsideDistance(x, z);
    if (out > 0) return this.hills(x, z) * smoothstep(0, 900, out);
    const w = map.waterWeight(x, z);
    if (w <= 0) return 0;
    const depth = map.classAt(x, z) === LAND.sea ? this.c.seaDepth : this.r.riverDepth;
    return -depth * smoothstep(0.1, 0.9, w);
  }

  private mapUrban(x: number, z: number): number {
    const k = this.map!.classAt(x, z);
    if (k === -1) return 1 - smoothstep(0, 900, this.map!.outsideDistance(x, z));
    return k === LAND.park || k === LAND.forest || k === LAND.grass ? 0 : 1;
  }

  private mapColor(map: CityMap, x: number, z: number, out: number[]): number[] {
    const k = map.classAt(x, z);
    const vary = noise2D(x / 90, z / 90, this.c.seed + 53);
    switch (k) {
      case LAND.forest:
      case LAND.park: {
        mixHex(COL.grass, COL.grassDark, vary, out);
        const pick = COL.canopy[hashCoords(Math.floor(x / 16), Math.floor(z / 16), this.c.seed + 71) % COL.canopy.length]!;
        mixInto(out, pick, k === LAND.forest ? 0.8 : 0.35);
        return out;
      }
      case LAND.grass:
        return mixHex(COL.grass, COL.meadow, vary * 0.6, out);
      case LAND.airport:
        return mixHex(COL.grass, COL.town, 0.3 + vary * 0.2, out);
      case LAND.railway:
        return mixHex(COL.rockDark, COL.road, 0.4, out);
      default:
        // Built-up ground between the lots: pale paving with a hint of green.
        return mixHex(COL.paving, COL.town, 0.15 + vary * 0.15, out);
    }
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
    if (this.map?.inside(x, z)) return this.mapColor(this.map, x, z, out);
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
    // Snow caps the Alps, thinning on steep faces.
    const snowLine = this.r.alps.snowLine + (vary - 0.5) * 80;
    const snow = smoothstep(snowLine, snowLine + 40, h) * (1 - smoothstep(0.9, 1.4, slope));
    if (snow > 0) mixInto(out, COL.snow, snow);
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
