export interface ChunkCoord {
  cx: number;
  cz: number;
  /** Distance (m) from the query point to the chunk center. */
  dist: number;
}

export const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;

/** Distance from a point to a chunk's center. */
export function chunkDistance(cx: number, cz: number, x: number, z: number, size: number): number {
  return Math.hypot((cx + 0.5) * size - x, (cz + 0.5) * size - z);
}

/** All chunks whose centers lie within `radius` of (x, z), nearest first. */
export function chunksInRadius(x: number, z: number, radius: number, size: number): ChunkCoord[] {
  const out: ChunkCoord[] = [];
  const r = Math.ceil(radius / size) + 1;
  const pcx = Math.floor(x / size);
  const pcz = Math.floor(z / size);
  for (let cx = pcx - r; cx <= pcx + r; cx++) {
    for (let cz = pcz - r; cz <= pcz + r; cz++) {
      const dist = chunkDistance(cx, cz, x, z, size);
      if (dist <= radius) out.push({ cx, cz, dist });
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

/** Chunks overlapping a circle (for spatial queries like crushing). */
export function chunksOverlappingCircle(x: number, z: number, radius: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let cx = Math.floor((x - radius) / size); cx <= Math.floor((x + radius) / size); cx++) {
    for (let cz = Math.floor((z - radius) / size); cz <= Math.floor((z + radius) / size); cz++) out.push([cx, cz]);
  }
  return out;
}
