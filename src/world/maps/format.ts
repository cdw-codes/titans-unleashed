/**
 * Baked city map format, shared by the dev bake tool (tools/osm) and the game.
 * A map is a land-cover grid (one byte per cell, gzip-compressed) plus JSON with
 * roads, tall buildings, towers and place names, all in game meters.
 * Dependency-free so Node can run it directly.
 */

/** Land-cover classes stored in the grid. Order = paint priority in the bake (later wins). */
export const LAND = {
  /** Built-up land not otherwise tagged (most of a city). */
  urban: 0,
  commercial: 1,
  industrial: 2,
  railway: 3,
  port: 4,
  airport: 5,
  park: 6,
  forest: 7,
  grass: 8,
  water: 9,
  sea: 10,
} as const;

export type LandClass = (typeof LAND)[keyof typeof LAND];

export type RoadKind = 'motorway' | 'trunk' | 'primary' | 'secondary' | 'runway';

export interface MapRoad {
  kind: RoadKind;
  /** Polyline in game meters, flattened [x0, z0, x1, z1, ...]. */
  pts: number[];
}

export interface MapBuilding {
  x: number;
  z: number;
  /** Real footprint half extents (m), not compressed. */
  hw: number;
  hd: number;
  /** Real height (m). */
  h: number;
}

export interface MapTower {
  x: number;
  z: number;
  h: number;
  name?: string;
}

export interface MapPlace {
  name: string;
  x: number;
  z: number;
  /** Ward-level places are announced; smaller ones only label the minimap. */
  rank: 'major' | 'minor';
}

export interface MapMeta {
  id: string;
  name: string;
  /** Grid: `cols` x `rows` cells of `cell` m; cell (0, 0) has its min corner at (minX, minZ). */
  cell: number;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  spawn: { x: number; z: number };
  roads: MapRoad[];
  buildings: MapBuilding[];
  towers: MapTower[];
  places: MapPlace[];
  attribution: string;
}

export interface Projection {
  lat0: number;
  lon0: number;
  /** Real distances are divided by this (3.5 = everything 3.5x closer). */
  compress: number;
}

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON_EQ = 111320;

/** Lat/lon → game meters (x east, z south), equirectangular around (lat0, lon0). */
export function project(p: Projection, lat: number, lon: number): [number, number] {
  const x = ((lon - p.lon0) * Math.cos((p.lat0 * Math.PI) / 180) * M_PER_DEG_LON_EQ) / p.compress;
  const z = (-(lat - p.lat0) * M_PER_DEG_LAT) / p.compress;
  return [x, z];
}

/** Real meters per degree at this latitude (for footprint sizes, which are not compressed). */
export function metersPerDegree(lat: number): { lat: number; lon: number } {
  return { lat: M_PER_DEG_LAT, lon: Math.cos((lat * Math.PI) / 180) * M_PER_DEG_LON_EQ };
}
