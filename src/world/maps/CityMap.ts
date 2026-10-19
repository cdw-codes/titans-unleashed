import { LAND, type LandClass, type MapBuilding, type MapMeta, type MapRoad, type MapTower, type RoadKind } from './format';

/** Road width (m) per kind: narrower than real so compressed districts aren't all asphalt. */
export const ROAD_WIDTH: Readonly<Record<RoadKind, number>> = {
  motorway: 22,
  trunk: 18,
  primary: 15,
  secondary: 11,
  runway: 55,
};

/** One straight road piece, short enough to belong to a single chunk. */
export interface RoadPiece {
  kind: RoadKind;
  x: number;
  z: number;
  /** Unit direction along the road. */
  dx: number;
  dz: number;
  length: number;
  width: number;
}

const PIECE = 64;

/**
 * A baked real city (public/maps/<id>): land-cover lookups, smoothed water for
 * the terrain, and roads / tall buildings / towers / place names bucketed by
 * chunk so generation stays a cheap per-chunk query.
 */
export class CityMap {
  readonly maxX: number;
  readonly maxZ: number;
  private readonly roadBuckets = new Map<string, RoadPiece[]>();
  private readonly buildingBuckets = new Map<string, MapBuilding[]>();
  private readonly towerBuckets = new Map<string, MapTower[]>();

  constructor(readonly meta: MapMeta, private readonly grid: Uint8Array, private readonly chunkSize = 256) {
    this.maxX = meta.minX + meta.cols * meta.cell;
    this.maxZ = meta.minZ + meta.rows * meta.cell;
    for (const r of meta.roads) this.addRoad(r);
    for (const b of meta.buildings) this.bucket(this.buildingBuckets, b.x, b.z).push(b);
    for (const t of meta.towers) this.bucket(this.towerBuckets, t.x, t.z).push(t);
  }

  static async load(id: string, base = import.meta.env.BASE_URL): Promise<CityMap> {
    const [meta, bin] = await Promise.all([
      fetch(`${base}maps/${id}.json`).then((r) => {
        if (!r.ok) throw new Error(`Map ${id}: ${r.status}`);
        return r.json() as Promise<MapMeta>;
      }),
      fetch(`${base}maps/${id}.bin`).then(async (r) => {
        if (!r.ok || !r.body) throw new Error(`Map ${id} grid: ${r.status}`);
        const stream = r.body.pipeThrough(new DecompressionStream('gzip'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }),
    ]);
    return new CityMap(meta, bin);
  }

  get name(): string {
    return this.meta.name;
  }

  inside(x: number, z: number): boolean {
    return x >= this.meta.minX && x < this.maxX && z >= this.meta.minZ && z < this.maxZ;
  }

  /** Signed distance (m) outside the map rectangle (negative inside). */
  outsideDistance(x: number, z: number): number {
    const dx = Math.max(this.meta.minX - x, x - this.maxX);
    const dz = Math.max(this.meta.minZ - z, z - this.maxZ);
    return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz);
  }

  /** Land-cover class at a point, or -1 outside the map. */
  classAt(x: number, z: number): LandClass | -1 {
    const c = Math.floor((x - this.meta.minX) / this.meta.cell);
    const r = Math.floor((z - this.meta.minZ) / this.meta.cell);
    if (c < 0 || r < 0 || c >= this.meta.cols || r >= this.meta.rows) return -1;
    return this.grid[r * this.meta.cols + c] as LandClass;
  }

  /** 0..1 water (rivers, lakes, sea), bilinearly smoothed between cell centers. */
  waterWeight(x: number, z: number): number {
    const m = this.meta;
    const fx = (x - m.minX) / m.cell - 0.5;
    const fz = (z - m.minZ) / m.cell - 0.5;
    const c = Math.floor(fx);
    const r = Math.floor(fz);
    const tx = fx - c;
    const tz = fz - r;
    const w = (cc: number, rr: number) => {
      const cl = Math.min(m.cols - 1, Math.max(0, cc));
      const rl = Math.min(m.rows - 1, Math.max(0, rr));
      const v = this.grid[rl * m.cols + cl];
      return v === LAND.water || v === LAND.sea ? 1 : 0;
    };
    const top = w(c, r) * (1 - tx) + w(c + 1, r) * tx;
    const bottom = w(c, r + 1) * (1 - tx) + w(c + 1, r + 1) * tx;
    return top * (1 - tz) + bottom * tz;
  }

  roadsIn(cx: number, cz: number): readonly RoadPiece[] {
    return this.roadBuckets.get(`${cx},${cz}`) ?? [];
  }

  buildingsIn(cx: number, cz: number): readonly MapBuilding[] {
    return this.buildingBuckets.get(`${cx},${cz}`) ?? [];
  }

  towersIn(cx: number, cz: number): readonly MapTower[] {
    return this.towerBuckets.get(`${cx},${cz}`) ?? [];
  }

  /** Every road piece that could touch the square around (x, z) (this chunk and its neighbors). */
  roadsNear(x: number, z: number): RoadPiece[] {
    const S = this.chunkSize;
    const cx = Math.floor(x / S);
    const cz = Math.floor(z / S);
    const out: RoadPiece[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...this.roadsIn(cx + i, cz + j));
    return out;
  }

  /** The nearest announced place within range, for region toasts. */
  placeAt(x: number, z: number, range = 900): string | null {
    let best: string | null = null;
    let bestD = range;
    for (const p of this.meta.places) {
      if (p.rank !== 'major') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p.name;
      }
    }
    return best;
  }

  private bucket<T>(map: Map<string, T[]>, x: number, z: number): T[] {
    const key = `${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`;
    let list = map.get(key);
    if (!list) map.set(key, (list = []));
    return list;
  }

  private addRoad(r: MapRoad): void {
    const width = ROAD_WIDTH[r.kind];
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const ax = r.pts[i]!;
      const az = r.pts[i + 1]!;
      const bx = r.pts[i + 2]!;
      const bz = r.pts[i + 3]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      const n = Math.ceil(len / PIECE);
      for (let k = 0; k < n; k++) {
        const l = len / n;
        const x = ax + dx * l * (k + 0.5);
        const z = az + dz * l * (k + 0.5);
        this.bucket(this.roadBuckets, x, z).push({ kind: r.kind, x, z, dx, dz, length: l, width });
      }
    }
  }
}
