import { noise2D } from '../../core/math';
import type { CityConfig } from '../../config/city';
import type { Terrain, Town } from '../terrain/Terrain';
import { LAND } from '../maps/format';
import type { CityMap } from '../maps/CityMap';
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
  if (terrain.map) return mapPlace(terrain.map, x0, z0, size, terrain);
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

/** City-map chunks: district from the land-cover mix (4 x 4 samples) and real tall buildings. */
function mapPlace(map: CityMap, x0: number, z0: number, size: number, terrain: Terrain): ChunkPlace {
  const x = x0 + size / 2;
  const z = z0 + size / 2;
  if (!map.inside(x, z)) return { district: terrain.biomeAt(x, z), town: null, f: 1 };
  const counts = new Map<number, number>();
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const k = map.classAt(x0 + (i + 0.5) * (size / 4), z0 + (j + 0.5) * (size / 4));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const share = (...ks: number[]) => ks.reduce((n, k) => n + (counts.get(k) ?? 0), 0) / 16;
  const place = (district: District): ChunkPlace => ({ district, town: null, f: 1 });
  if (share(LAND.sea, LAND.water) >= 0.7) return place(share(LAND.sea) >= 0.35 ? 'sea' : 'meadow');
  if (share(LAND.airport) >= 0.5) return place('airport');
  if (share(LAND.forest, LAND.park) >= 0.5) return place('forest');
  if (share(LAND.grass) >= 0.5) return place('meadow');
  const cx = Math.floor(x0 / size);
  const cz = Math.floor(z0 / size);
  const tall = map.buildingsIn(cx, cz).length;
  if (share(LAND.port) >= 0.4) return place('docks');
  if (share(LAND.industrial, LAND.railway) >= 0.45) return place('industrial');
  if (tall >= 2 || share(LAND.commercial) >= 0.35) return place('downtown');
  // Dense mixed city: mostly mid-rise, some low-rise housing pockets.
  return place(tall >= 1 || share(LAND.commercial) > 0 || noise2D(x / 700, z / 700, 17) > 0.15 ? 'fringe' : 'suburbs');
}
