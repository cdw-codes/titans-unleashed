/**
 * Drop point: where the titan starts, picked on the title screen's map preview.
 * Stored as a fraction of the preview (u east, v south, 0..1) in `?spawn=u,v`, so it
 * works before the chosen world is loaded. City previews cover the map bbox
 * (equirectangular, like the bake); open-world previews cover ±OPEN_PREVIEW_RANGE.
 */
export type Uv = readonly [number, number];
/** Half-size (m) of the open-world preview square around the origin. */
export const OPEN_PREVIEW_RANGE = 11000;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function parseDrop(search: string): Uv | null {
  const raw = new URLSearchParams(search).get('spawn');
  if (!raw) return null;
  const [u, v] = raw.split(',').map(Number);
  if (u === undefined || v === undefined || !Number.isFinite(u) || !Number.isFinite(v)) return null;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return [u, v];
}

export function formatDrop(uv: Uv): string {
  return `${uv[0].toFixed(3)},${uv[1].toFixed(3)}`;
}

/** [south, west, north, east] bbox → preview fraction of a lat/lon. */
export function bboxUv(bbox: readonly [number, number, number, number], lat: number, lon: number): Uv {
  const [s, w, n, e] = bbox;
  return [clamp01((lon - w) / (e - w)), clamp01((n - lat) / (n - s))];
}

export function bboxLatLon(bbox: readonly [number, number, number, number], uv: Uv): [number, number] {
  const [s, w, n, e] = bbox;
  return [n - uv[1] * (n - s), w + uv[0] * (e - w)];
}

/** World meters ↔ preview fraction for a rectangle (city map extents or the open-world square). */
export function rectUv(minX: number, minZ: number, maxX: number, maxZ: number, x: number, z: number): Uv {
  return [clamp01((x - minX) / (maxX - minX)), clamp01((z - minZ) / (maxZ - minZ))];
}

export function rectWorld(minX: number, minZ: number, maxX: number, maxZ: number, uv: Uv): [number, number] {
  return [minX + uv[0] * (maxX - minX), minZ + uv[1] * (maxZ - minZ)];
}

export const openUv = (x: number, z: number): Uv => rectUv(-OPEN_PREVIEW_RANGE, -OPEN_PREVIEW_RANGE, OPEN_PREVIEW_RANGE, OPEN_PREVIEW_RANGE, x, z);
export const openWorld = (uv: Uv): [number, number] => rectWorld(-OPEN_PREVIEW_RANGE, -OPEN_PREVIEW_RANGE, OPEN_PREVIEW_RANGE, OPEN_PREVIEW_RANGE, uv);
