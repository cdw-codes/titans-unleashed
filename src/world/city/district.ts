import { noise2D } from '../../core/math';
import type { CityConfig } from '../../config/city';
import type { District } from './types';

/** District for a world position (evaluated at chunk centers so blocks stay coherent). */
export function districtAt(x: number, z: number, c: CityConfig): District {
  if (x >= c.coastX) return 'sea';
  if (x >= c.coastX - c.docksWidth) return 'docks';
  const r = Math.hypot(x, z);
  if (r < c.downtownRadius) return 'downtown';
  if (r >= c.industrialMinRadius && noise2D(x * c.industrialNoiseScale, z * c.industrialNoiseScale, c.seed % 1000) > c.industrialThreshold) {
    return 'industrial';
  }
  if (r < c.fringeRadius) return 'fringe';
  return 'suburbs';
}
