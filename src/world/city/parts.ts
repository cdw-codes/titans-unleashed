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
