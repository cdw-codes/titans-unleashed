/**
 * Real cities, baked from OpenStreetMap by `npm run map:fetch <id>` then
 * `npm run map:bake <id>` into public/maps/<id>.json + .bin. Distances are
 * compressed (`compress`) so districts are minutes apart for a 100 m titan;
 * building footprints and heights stay real.
 */
export interface CityMapDef {
  readonly id: string;
  readonly name: string;
  /** [south, west, north, east] in degrees. */
  readonly bbox: readonly [number, number, number, number];
  readonly compress: number;
  /** Game meters per land-cover cell. */
  readonly cell: number;
  /** Points known to be open sea (flood-fill seeds inside the coastline). */
  readonly seaSeeds: readonly (readonly [number, number])[];
  /** Where the titan starts [lat, lon]. */
  readonly spawn: readonly [number, number];
  /** OSM place types announced as regions on entry. */
  readonly majorPlaces: readonly string[];
  /** Real heights (m) for towers OSM maps only as a base (keyed by English name). */
  readonly towerHeights?: Readonly<Record<string, number>>;
}

export const CITY_MAPS: readonly CityMapDef[] = [
  {
    id: 'tokyo',
    name: 'Tokyo',
    // The 23 special wards and the inner bay, Haneda included.
    bbox: [35.52, 139.6, 35.79, 139.92],
    compress: 3.5,
    cell: 16,
    seaSeeds: [[35.56, 139.86], [35.6, 139.82]],
    // Outside Tokyo Station, facing the Marunouchi towers.
    spawn: [35.6795, 139.7745],
    majorPlaces: ['city', 'suburb'],
    towerHeights: { 'Tokyo Tower': 333 },
  },
];

/** Map chosen with ?map=<id>; 'open' (or unknown) = the procedural open world. */
export function selectedMapId(search: string = typeof location === 'undefined' ? '' : location.search): string | null {
  const id = new URLSearchParams(search).get('map') ?? 'tokyo';
  return CITY_MAPS.some((m) => m.id === id) ? id : null;
}
