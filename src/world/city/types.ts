/** Plain data describing generated city content. No three.js / Rapier here (testable). */

export type District = 'downtown' | 'fringe' | 'suburbs' | 'industrial' | 'docks' | 'sea';

export type StructureKind =
  | 'tower' | 'midrise' | 'warehouse' | 'chimney' | 'tank' // large: collider + HP
  | 'shop' | 'house' // small: crushed on contact
  | 'tree' | 'car' | 'container'; // prop: crushed on contact, only near the player

export type SizeClass = 'large' | 'small' | 'prop';

/** Which shared instanced pool renders a part. */
export type PoolId = 'windowed' | 'plain' | 'roof' | 'cylinder' | 'tree' | 'car' | 'flat';

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
  color: number;
}

export interface StructureSpec {
  kind: StructureKind;
  size: SizeClass;
  /** Footprint center and half extents (axis aligned in the structure's rotY frame). */
  x: number;
  z: number;
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
}

export const SIZE_OF: Readonly<Record<StructureKind, SizeClass>> = {
  tower: 'large',
  midrise: 'large',
  warehouse: 'large',
  chimney: 'large',
  tank: 'large',
  shop: 'small',
  house: 'small',
  tree: 'prop',
  car: 'prop',
  container: 'prop',
};
