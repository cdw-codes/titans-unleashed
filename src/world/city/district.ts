import { noise2D } from '../../core/math';
import type { CityConfig } from '../../config/city';
import type { Terrain, Town } from '../terrain/Terrain';
import type { District, UrbanDistrict } from './types';

/** District of a town chunk centered at (x, z); `f` = 0 at the town center, 1 at its edge. */
export function townDistrict(town: Town, f: number, x: number, z: number, terrain: Terrain, c: CityConfig): UrbanDistrict | 'airport' | 'plant' {
  if (town.kind === 'airport') return 'airport';
  if (town.kind === 'plant') return 'plant';
  if (town.kind !== 'island' && x > terrain.coastX(z) - c.docksWidth) return 'docks';
  switch (town.kind) {
    case 'city':
      if (f < c.downtownFraction) return 'downtown';
      if (f >= c.industrialMinFraction && noise2D(x * c.industrialNoiseScale, z * c.industrialNoiseScale, c.seed % 1000) > c.industrialThreshold) {
        return 'industrial';
      }
      return f < c.fringeFraction ? 'fringe' : 'suburbs';
    case 'island':
      // A wall of supertall towers along the spine, mid-rise at the tips.
      return f < 0.75 ? 'downtown' : 'fringe';
    case 'metro':
      if (f < 0.22) return 'downtown';
      return f < 0.88 ? 'fringe' : 'suburbs';
    case 'works':
      return f < c.worksCoreFraction ? 'industrial' : 'suburbs';
    default:
      return f < c.villageCoreFraction ? 'fringe' : 'suburbs';
  }
}

export interface ChunkPlace {
  district: District;
  /** The town the chunk belongs to (null in the countryside and at sea). */
  town: Town | null;
  /** Position inside the town: 0 center, 1 edge. */
  f: number;
}

/** What occupies the chunk with corner (x0, z0): a town district, a countryside biome or sea. */
export function chunkPlace(x0: number, z0: number, size: number, terrain: Terrain, c: CityConfig): ChunkPlace {
  const x = x0 + size / 2;
  const z = z0 + size / 2;
  if (terrain.isSea(x, z) && terrain.heightAt(x, z) < terrain.waterLevel) return { district: 'sea', town: null, f: 1 };
  // The narrow island counts any chunk whose center is on it (its coast trims the rest).
  const town = terrain.isTownSquare(x0, z0, size) ?? (terrain.townEdge(terrain.island, x, z) < -20 ? terrain.island : null);
  if (town) {
    const f = terrain.townFraction(town, x, z);
    return { district: townDistrict(town, f, x, z, terrain, c), town, f };
  }
  return { district: terrain.biomeAt(x, z), town: null, f: 1 };
}

/** District of the chunk with corner (x0, z0). */
export function districtAt(x0: number, z0: number, size: number, terrain: Terrain, c: CityConfig): District {
  return chunkPlace(x0, z0, size, terrain, c).district;
}
