import { noise2D } from '../../core/math';
import type { CityConfig } from '../../config/city';
import type { Terrain, Town } from '../terrain/Terrain';
import type { District, UrbanDistrict } from './types';

/** District of a town chunk centered at (x, z), `dist` from the town center. */
export function townDistrict(town: Town, dist: number, x: number, z: number, terrain: Terrain, c: CityConfig): UrbanDistrict {
  if (x > terrain.coastX(z) - c.docksWidth) return 'docks';
  const f = dist / town.radius;
  switch (town.kind) {
    case 'city':
      if (f < c.downtownFraction) return 'downtown';
      if (f >= c.industrialMinFraction && noise2D(x * c.industrialNoiseScale, z * c.industrialNoiseScale, c.seed % 1000) > c.industrialThreshold) {
        return 'industrial';
      }
      return f < c.fringeFraction ? 'fringe' : 'suburbs';
    case 'works':
      return f < c.worksCoreFraction ? 'industrial' : 'suburbs';
    case 'village':
    case 'port':
      return f < c.villageCoreFraction ? 'fringe' : 'suburbs';
  }
}

/** District of the chunk with corner (x0, z0): town district, countryside biome or sea. */
export function districtAt(x0: number, z0: number, size: number, terrain: Terrain, c: CityConfig): District {
  const x = x0 + size / 2;
  const z = z0 + size / 2;
  if (terrain.isSea(x, z) && terrain.heightAt(x, z) < terrain.waterLevel) return 'sea';
  const town = terrain.isTownSquare(x0, z0, size);
  if (town) return townDistrict(town, Math.hypot(x - town.x, z - town.z), x, z, terrain, c);
  return terrain.biomeAt(x, z);
}
