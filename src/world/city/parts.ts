import type { PartSpec, PoolId } from './types';

/** One instanced part (base center, full size). */
export function part(pool: PoolId, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number, color: number, tilt?: number): PartSpec {
  return tilt ? { pool, x, y, z, sx, sy, sz, rotY, tilt, color } : { pool, x, y, z, sx, sy, sz, rotY, color };
}

/** A ground decal (roads, lots, runways). */
export function flat(x: number, z: number, sx: number, sz: number, color: number, y: number, rotY = 0): PartSpec {
  return part('flat', x, y, z, sx, 1, sz, rotY, color);
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

const TOWER_COL = { white: 0xf1f0ec, signal: 0xd9512c, glass: 0x5d7f99 };

/**
 * Original broadcast tower (no lattice): flared base, banded tapering shaft,
 * two observation decks and an antenna, proportioned to any height.
 */
export function broadcastTowerParts(x: number, z: number, h: number): PartSpec[] {
  const k = h / 330;
  const w = Math.min(1.6, Math.max(0.7, k));
  return [
    part('cone', x, 0, z, 64 * w, 22 * k, 64 * w, 0, TOWER_COL.white),
    part('cone', x, 22 * k, z, 30 * w, 80 * k, 30 * w, 0, TOWER_COL.signal),
    part('cone', x, 102 * k, z, 21 * w, 70 * k, 21 * w, 0, TOWER_COL.white),
    part('cylinder', x, 150 * k, z, 46 * w, 16 * k, 46 * w, 0, TOWER_COL.glass),
    part('cone', x, 172 * k, z, 15 * w, 70 * k, 15 * w, 0, TOWER_COL.signal),
    part('cylinder', x, 238 * k, z, 26 * w, 9 * k, 26 * w, 0, TOWER_COL.glass),
    part('cylinder', x, 247 * k, z, 3 * w, h - 247 * k, 3 * w, 0, TOWER_COL.white),
  ];
}
