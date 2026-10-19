/**
 * Pure rasterization helpers for the map bake (tested). Coordinates are game
 * meters; the grid has `cols` x `rows` cells of `cell` m with its min corner at
 * (minX, minZ). Cell centers are sampled.
 */
export interface Grid {
  cols: number;
  rows: number;
  cell: number;
  minX: number;
  minZ: number;
  data: Uint8Array;
}

/** A segment list: [x0, z0, x1, z1] per segment. Rings need not be stitched. */
export type Segments = number[][];

export function makeGrid(minX: number, minZ: number, maxX: number, maxZ: number, cell: number, fill: number): Grid {
  const cols = Math.ceil((maxX - minX) / cell);
  const rows = Math.ceil((maxZ - minZ) / cell);
  return { cols, rows, cell, minX, minZ, data: new Uint8Array(cols * rows).fill(fill) };
}

/** Rings (closed or not) → segments. */
export function ringsToSegments(rings: number[][][]): Segments {
  const segs: Segments = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) segs.push([ring[i]![0]!, ring[i]![1]!, ring[i + 1]![0]!, ring[i + 1]![1]!]);
  }
  return segs;
}

/**
 * Even-odd scanline fill of a polygon given as loose segments (outer and inner
 * rings mixed, as OSM multipolygon members arrive): every enclosed cell center
 * gets `value`.
 */
export function fillPolygon(g: Grid, segs: Segments, value: number): void {
  if (!segs.length) return;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of segs) {
    minZ = Math.min(minZ, s[1]!, s[3]!);
    maxZ = Math.max(maxZ, s[1]!, s[3]!);
  }
  const r0 = Math.max(0, Math.floor((minZ - g.minZ) / g.cell));
  const r1 = Math.min(g.rows - 1, Math.ceil((maxZ - g.minZ) / g.cell));
  const xs: number[] = [];
  for (let r = r0; r <= r1; r++) {
    const z = g.minZ + (r + 0.5) * g.cell;
    xs.length = 0;
    for (const [ax, az, bx, bz] of segs as [number, number, number, number][]) {
      // Half-open rule so shared vertices count once.
      if ((az <= z && bz > z) || (bz <= z && az > z)) xs.push(ax + ((z - az) / (bz - az)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const c0 = Math.max(0, Math.ceil((xs[i]! - g.minX) / g.cell - 0.5));
      const c1 = Math.min(g.cols - 1, Math.floor((xs[i + 1]! - g.minX) / g.cell - 0.5));
      for (let c = c0; c <= c1; c++) g.data[r * g.cols + c] = value;
    }
  }
}

/** Mark every cell a segment passes through (4-connected, so fills can't leak diagonally). */
export function drawLines(g: Grid, segs: Segments, mark: Uint8Array): void {
  for (const [ax, az, bx, bz] of segs as [number, number, number, number][]) {
    let x = Math.floor((ax - g.minX) / g.cell);
    let z = Math.floor((az - g.minZ) / g.cell);
    const x1 = Math.floor((bx - g.minX) / g.cell);
    const z1 = Math.floor((bz - g.minZ) / g.cell);
    const dx = Math.abs(x1 - x);
    const dz = Math.abs(z1 - z);
    const sx = x1 > x ? 1 : -1;
    const sz = z1 > z ? 1 : -1;
    // Supercover walk: step along whichever axis boundary is closer.
    const fx = (bx - ax) / g.cell;
    const fz = (bz - az) / g.cell;
    const ox = (ax - g.minX) / g.cell;
    const oz = (az - g.minZ) / g.cell;
    let tMaxX = dx ? ((sx > 0 ? x + 1 : x) - ox) / fx : Infinity;
    let tMaxZ = dz ? ((sz > 0 ? z + 1 : z) - oz) / fz : Infinity;
    const tDX = dx ? Math.abs(1 / fx) : Infinity;
    const tDZ = dz ? Math.abs(1 / fz) : Infinity;
    for (let n = 0; n <= dx + dz; n++) {
      if (x >= 0 && z >= 0 && x < g.cols && z < g.rows) mark[z * g.cols + x] = 1;
      if (tMaxX < tMaxZ) {
        tMaxX += tDX;
        x += sx;
      } else {
        tMaxZ += tDZ;
        z += sz;
      }
    }
  }
}

/** Flood fill (4-connected) from seed cells over cells not in `barrier`, writing `value`. Returns cells filled. */
export function floodFill(g: Grid, seeds: [number, number][], barrier: Uint8Array, value: number): number {
  const stack: number[] = [];
  const seen = new Uint8Array(g.cols * g.rows);
  for (const [x, z] of seeds) {
    const c = Math.floor((x - g.minX) / g.cell);
    const r = Math.floor((z - g.minZ) / g.cell);
    if (c >= 0 && r >= 0 && c < g.cols && r < g.rows) stack.push(r * g.cols + c);
  }
  let n = 0;
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || barrier[i]) continue;
    seen[i] = 1;
    g.data[i] = value;
    n++;
    const c = i % g.cols;
    if (c > 0) stack.push(i - 1);
    if (c < g.cols - 1) stack.push(i + 1);
    if (i >= g.cols) stack.push(i - g.cols);
    if (i < g.data.length - g.cols) stack.push(i + g.cols);
  }
  return n;
}

/** Douglas–Peucker on a flat [x, z, ...] polyline. */
export function simplify(pts: number[], tolerance: number): number[] {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a * 2]!;
    const az = pts[a * 2 + 1]!;
    const dx = pts[b * 2]! - ax;
    const dz = pts[b * 2 + 1]! - az;
    const len = Math.hypot(dx, dz) || 1;
    let best = -1;
    let bestD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i * 2]! - ax) * dz - (pts[i * 2 + 1]! - az) * dx) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2]!, pts[i * 2 + 1]!);
  return out;
}
