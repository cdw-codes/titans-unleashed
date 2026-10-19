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
  {
    id: 'newyork',
    name: 'New York',
    // Manhattan, Brooklyn, western Queens, Jersey City and the Upper Bay.
    bbox: [40.6, -74.08, 40.84, -73.86],
    compress: 3.5,
    cell: 16,
    seaSeeds: [[40.665, -74.04], [40.62, -74.03], [40.7, -74.02]],
    // Times Square, among the Midtown towers.
    spawn: [40.758, -73.9855],
    majorPlaces: ['borough', 'city', 'suburb'],
  },
  {
    id: 'london',
    name: 'London',
    // Central London both sides of the Thames, Westminster to Canary Wharf.
    bbox: [51.45, -0.24, 51.56, 0.03],
    compress: 3.5,
    cell: 16,
    // Inland: the Thames comes from the water polygons, there is no open sea.
    seaSeeds: [],
    // Trafalgar Square.
    spawn: [51.508, -0.128],
    majorPlaces: ['city', 'borough', 'suburb'],
  },
];

/** Map chosen with ?map=<id>; 'open' (or unknown) = the procedural open world. */
export function selectedMapId(search: string = typeof location === 'undefined' ? '' : location.search): string | null {
  const id = new URLSearchParams(search).get('map') ?? 'tokyo';
  return CITY_MAPS.some((m) => m.id === id) ? id : null;
}

/** A new open-world seed (1..99999; noise stays precise at this size). */
export function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 99999);
}

/**
 * Open-world seed from ?seed=: a number, 'classic' (the hand-made layout = null),
 * or absent (a new random world every game, written back to the URL so a reload
 * keeps it and the world can be shared).
 */
export function selectedSeed(): number | null {
  const q = new URLSearchParams(location.search);
  const raw = q.get('seed');
  if (raw === 'classic') return null;
  const n = Number(raw);
  if (raw && Number.isInteger(n) && n > 0 && n < 100000) return n;
  const seed = randomSeed();
  q.set('seed', String(seed));
  history.replaceState(null, '', `${location.pathname}?${q}`);
  return seed;
}

/** Reload into a URL with these parameters changed (map / seed). */
export function reloadWith(params: Record<string, string>): void {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) q.set(k, v);
  location.search = q.toString();
}
