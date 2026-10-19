import { noise2D } from '../../core/math';

/**
 * Coastline of a generated open world: 1–3 straight coast lines (sea beyond each),
 * roughened with noise into bays and headlands. `planes` are [nx, nz, c]: the sea
 * lies where x·nx + z·nz > c. One plane = a coast, two adjacent = a bay corner, two
 * opposite = a strait-bounded band of land, three = a peninsula.
 */
export interface ShoreDef {
  readonly kind: 'coast' | 'bay' | 'strait' | 'peninsula';
  readonly planes: readonly (readonly [number, number, number])[];
  /** Amplitude (m) of the bays and headlands. */
  readonly wave: number;
}

/** Signed distance (m) past the coastline: positive at sea, negative inland. */
export function shoreDistance(s: ShoreDef, seed: number, x: number, z: number): number {
  let d = -Infinity;
  for (const [nx, nz, c] of s.planes) d = Math.max(d, x * nx + z * nz - c);
  return (
    d +
    (noise2D(x / 2400 + 3.1, z / 2400 - 1.7, seed + 11) - 0.5) * 2 * s.wave +
    (noise2D(x / 650 - 7.3, z / 650 + 2.9, seed + 12) - 0.5) * s.wave * 0.35
  );
}

export interface CoastPoint {
  x: number;
  z: number;
  /** Unit normal pointing out to sea. */
  nx: number;
  nz: number;
}

/**
 * First point where the coast is reached walking from the origin along `angle`
 * (x = cos, z = sin), with the seaward normal there; null if the land runs on
 * past `max` (an open direction).
 */
export function coastPoint(dist: (x: number, z: number) => number, angle: number, max = 11000): CoastPoint | null {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let prev = dist(0, 0);
  for (let r = 40; r <= max; r += 40) {
    const x = dx * r;
    const z = dz * r;
    const d = dist(x, z);
    if (d >= 0 && prev < 0) {
      const gx = dist(x + 8, z) - dist(x - 8, z);
      const gz = dist(x, z + 8) - dist(x, z - 8);
      const len = Math.hypot(gx, gz) || 1;
      return { x, z, nx: gx / len, nz: gz / len };
    }
    prev = d;
  }
  return null;
}
