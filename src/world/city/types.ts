/** Plain data describing generated city content. No three.js / Rapier here (testable). */
import type { TerrainTileData } from '../terrain/Terrain';

/** Town districts (street grid) and countryside biomes (open terrain, no streets). */
export type UrbanDistrict = 'downtown' | 'fringe' | 'suburbs' | 'industrial' | 'docks';
export type District = UrbanDistrict | 'airport' | 'plant' | 'forest' | 'farmland' | 'meadow' | 'sea';

export type StructureKind =
  | 'tower' | 'midrise' | 'warehouse' | 'chimney' | 'tank' | 'silo' // large: collider + HP
  | 'mast' | 'pylon' | 'reactor' | 'stadium' | 'terminal' // large landmarks
  | 'shop' | 'house' | 'barn' | 'bridge' // small: crushed on contact
  | 'plane'
  | 'tree' | 'car' | 'container' | 'rock'; // prop (with 'plane'): crushed on contact, only near the player

export type SizeClass = 'large' | 'small' | 'prop';

/** Which shared instanced pool renders a part. */
export type PoolId = 'windowed' | 'plain' | 'roof' | 'cylinder' | 'cone' | 'dome' | 'cooling' | 'tree' | 'pine' | 'bush' | 'rock' | 'car' | 'truck' | 'plane' | 'flat';

/** One instance in a pool. Position is the base center; scale is the full size. */
export interface PartSpec {
  pool: PoolId;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  /** Optional pitch (rad) about the part's local X axis, applied after rotY (cables, ramps). */
  tilt?: number;
  color: number;
}

export interface StructureSpec {
  kind: StructureKind;
  size: SizeClass;
  /** Footprint center and half extents (axis aligned in the structure's rotY frame). */
  x: number;
  z: number;
  /** Ground height at the base (parts already include it). */
  y: number;
  halfW: number;
  halfD: number;
  height: number;
  rotY: number;
  parts: PartSpec[];
}

export interface ChunkSpec {
  cx: number;
  cz: number;
  district: District;
  structures: StructureSpec[];
  /** Ground decals: roads, lawns, lots. Not destructible. */
  flats: PartSpec[];
  /** Terrain heights and colors for this chunk. */
  ground: TerrainTileData;
}

export const SIZE_OF: Readonly<Record<StructureKind, SizeClass>> = {
  tower: 'large',
  midrise: 'large',
  warehouse: 'large',
  chimney: 'large',
  tank: 'large',
  silo: 'large',
  mast: 'large',
  pylon: 'large',
  reactor: 'large',
  stadium: 'large',
  terminal: 'large',
  shop: 'small',
  house: 'small',
  barn: 'small',
  bridge: 'small',
  plane: 'prop',
  rock: 'prop',
  tree: 'prop',
  car: 'prop',
  container: 'prop',
};
