/**
 * Real cities, baked from OpenStreetMap by `npm run map:fetch <id>` then
 * `npm run map:bake <id>` into public/maps/<id>.json + .bin. Distances are
 * compressed (`compress`) so districts are minutes apart for a 100 m titan;
 * building footprints and heights stay real.
 */
export interface CityMapDef {
  readonly id: string;
  readonly name: string;
  /** One line for the title screen. */
  readonly blurb: string;
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
    blurb: 'The 23 wards, Tokyo Bay and Haneda. Skytree included.',
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
    blurb: 'Manhattan, Brooklyn and the Upper Bay, Midtown to the Narrows.',
    // Manhattan, Brooklyn, western Queens, Jersey City and the Upper Bay.
    bbox: [40.6, -74.08, 40.84, -73.86],
    compress: 3.5,
    cell: 16,
    // Upper Bay, the Hudson off the Battery, the East River (all open water).
    seaSeeds: [[40.665, -74.04], [40.7, -74.02], [40.73, -73.97]],
    // Times Square, among the Midtown towers.
    spawn: [40.758, -73.9855],
    majorPlaces: ['borough', 'city', 'suburb', 'quarter', 'neighbourhood'],
  },
  {
    id: 'london',
    name: 'London',
    blurb: 'Both banks of the Thames, Westminster to Canary Wharf.',
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
  {
    id: 'paris',
    name: 'Paris',
    blurb: 'Inside the ring road, both banks of the Seine, out to La Défense.',
    bbox: [48.815, 2.215, 48.905, 2.42],
    compress: 3,
    cell: 16,
    seaSeeds: [],
    // Place de la Concorde.
    spawn: [48.8656, 2.3212],
    majorPlaces: ['suburb', 'city'],
  },
  {
    id: 'sanfrancisco',
    name: 'San Francisco',
    blurb: 'The peninsula from the Golden Gate to the Bay Bridge.',
    bbox: [37.705, -122.52, 37.832, -122.355],
    compress: 3.5,
    cell: 16,
    seaSeeds: [[37.8, -122.37], [37.75, -122.515], [37.815, -122.47], [37.73, -122.36]],
    // Union Square.
    spawn: [37.788, -122.4075],
    majorPlaces: ['suburb', 'neighbourhood'],
  },
  {
    id: 'hongkong',
    name: 'Hong Kong',
    blurb: 'Victoria Harbour between Hong Kong Island and Kowloon.',
    bbox: [22.245, 114.11, 22.345, 114.25],
    compress: 2.5,
    cell: 16,
    // Victoria Harbour and Kowloon Bay (a third seed at 22.28, 114.13 sat on Kennedy Town and flooded the island).
    seaSeeds: [[22.29, 114.17], [22.3, 114.2]],
    // Tsim Sha Tsui, facing the harbour.
    spawn: [22.2988, 114.1722],
    majorPlaces: ['suburb', 'quarter', 'town'],
  },
  {
    id: 'sydney',
    name: 'Sydney',
    blurb: 'The harbour, the CBD and the bridge, from Balmain to Bondi.',
    bbox: [-33.925, 151.13, -33.825, 151.3],
    compress: 3,
    cell: 16,
    seaSeeds: [[-33.852, 151.235], [-33.84, 151.27], [-33.89, 151.29]],
    // Martin Place, in the CBD.
    spawn: [-33.8679, 151.2108],
    majorPlaces: ['suburb'],
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

/** Change URL parameters without reloading (choices that apply live, e.g. the titan). */
export function updateUrl(params: Record<string, string>): void {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v === '') q.delete(k);
    else q.set(k, v);
  }
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

/** Cities whose baked files are present (the dev server answers missing files with HTML). */
export async function availableMaps(base: string): Promise<CityMapDef[]> {
  const ok = await Promise.all(
    CITY_MAPS.map((m) =>
      fetch(`${base}maps/${m.id}.json`, { method: 'HEAD' })
        .then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('json'))
        .catch(() => false),
    ),
  );
  return CITY_MAPS.filter((_, i) => ok[i]);
}

/** Reload into a URL with these parameters changed (map / seed). */
export function reloadWith(params: Record<string, string>): void {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v === '') q.delete(k);
    else q.set(k, v);
  }
  location.search = q.toString();
}
