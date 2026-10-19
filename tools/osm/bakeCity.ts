/**
 * Bake a downloaded city (tools/osm/cache/<id>) into the game's map files:
 *   public/maps/<id>.json   roads, tall buildings, towers, places (game meters)
 *   public/maps/<id>.bin    gzip land-cover grid (one byte per cell, see LAND)
 * Run: npm run map:bake tokyo. Data © OpenStreetMap contributors (ODbL); the
 * baked files are a derivative database under the same license.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { CITY_MAPS, type CityMapDef } from '../../src/config/maps.ts';
import { LAND, metersPerDegree, project, type MapBuilding, type MapMeta, type MapPlace, type MapRoad, type MapTower, type Projection, type RoadKind } from '../../src/world/maps/format.ts';
import { drawLines, fillPolygon, floodFill, makeGrid, simplify, type Grid, type Segments } from './raster.ts';

interface LatLon {
  lat: number;
  lon: number;
}
interface Element {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: LatLon;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  geometry?: LatLon[];
  members?: { type: string; role: string; geometry?: LatLon[] }[];
}

const root = resolve(import.meta.dirname, '../..');

async function layer(id: string, name: string): Promise<Element[]> {
  try {
    return (JSON.parse(await readFile(resolve(import.meta.dirname, 'cache', id, `${name}.json`), 'utf8')) as { elements: Element[] }).elements;
  } catch {
    console.warn(`  (no ${name} layer cached: skipped)`);
    return [];
  }
}

/** Every ring of a way or multipolygon relation, projected. */
function rings(p: Projection, el: Element): number[][][] {
  const toRing = (geom: LatLon[]) => geom.map((g) => project(p, g.lat, g.lon));
  if (el.type === 'way' && el.geometry) return [toRing(el.geometry)];
  if (el.type === 'relation' && el.members) {
    return el.members.filter((m) => m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === 'inner' || m.role === '')).map((m) => toRing(m.geometry!));
  }
  return [];
}

function segmentsOf(rs: number[][][]): Segments {
  const segs: Segments = [];
  for (const r of rs) for (let i = 0; i < r.length - 1; i++) segs.push([r[i]![0]!, r[i]![1]!, r[i + 1]![0]!, r[i + 1]![1]!]);
  return segs;
}

function landClass(t: Record<string, string>): number | null {
  if (t['aeroway'] === 'aerodrome') return LAND.airport;
  const lu = t['landuse'];
  if (lu === 'commercial' || lu === 'retail') return LAND.commercial;
  if (lu === 'industrial' || lu === 'military') return LAND.industrial;
  if (lu === 'railway') return LAND.railway;
  if (lu === 'port') return LAND.port;
  if (lu === 'forest' || t['natural'] === 'wood' || t['leisure'] === 'nature_reserve') return LAND.forest;
  if (lu === 'grass' || lu === 'cemetery' || lu === 'recreation_ground' || lu === 'meadow' || t['leisure'] === 'pitch' || t['leisure'] === 'golf_course') return LAND.grass;
  if (t['leisure'] === 'park' || t['leisure'] === 'garden' || t['leisure'] === 'stadium') return LAND.park;
  return null;
}

function parseHeight(t: Record<string, string>): number {
  const h = parseFloat(t['height'] ?? '');
  if (Number.isFinite(h)) return h;
  const lv = parseFloat(t['building:levels'] ?? '');
  return Number.isFinite(lv) ? lv * 3.6 : 0;
}

async function bake(def: CityMapDef): Promise<void> {
  const [s, w, n, e] = def.bbox;
  const p: Projection = { lat0: (s + n) / 2, lon0: (w + e) / 2, compress: def.compress };
  const [minX, maxZ] = project(p, s, w);
  const [maxX, minZ] = project(p, n, e);
  const g: Grid = makeGrid(minX, minZ, maxX, maxZ, def.cell, LAND.urban);
  console.log(`${def.id}: grid ${g.cols} x ${g.rows} (${def.cell} m cells), ${Math.round(maxX - minX)} x ${Math.round(maxZ - minZ)} m`);

  // Land cover, painted in priority order (later classes win).
  const painted: { cls: number; segs: Segments }[] = [];
  for (const el of await layer(def.id, 'landuse')) {
    const cls = el.tags ? landClass(el.tags) : null;
    if (cls !== null) painted.push({ cls, segs: segmentsOf(rings(p, el)) });
  }
  for (const el of await layer(def.id, 'water')) painted.push({ cls: LAND.water, segs: segmentsOf(rings(p, el)) });
  painted.sort((a, b) => a.cls - b.cls);
  for (const { cls, segs } of painted) fillPolygon(g, segs, cls);

  // Sea: flood-fill from the seeds, bounded by the coastline.
  const coast = new Uint8Array(g.cols * g.rows);
  const coastSegs: Segments = [];
  for (const el of await layer(def.id, 'coast')) coastSegs.push(...segmentsOf(rings(p, el)));
  drawLines(g, coastSegs, coast);
  const seeds = def.seaSeeds.map(([lat, lon]) => project(p, lat, lon));
  const sea = floodFill(g, seeds, coast, LAND.sea);
  console.log(`  sea cells: ${sea} (${Math.round((100 * sea) / g.data.length)}%)`);
  // Coastline cells themselves: sea where they touch it, so the shore is one clean edge.
  for (let i = 0; i < coast.length; i++) {
    if (!coast[i]) continue;
    const c = i % g.cols;
    const nb = [c > 0 ? i - 1 : -1, c < g.cols - 1 ? i + 1 : -1, i - g.cols, i + g.cols];
    if (nb.some((j) => j >= 0 && j < g.data.length && g.data[j] === LAND.sea) && g.data[i] === LAND.urban) g.data[i] = LAND.sea;
  }

  // Roads (and runways), simplified.
  const roads: MapRoad[] = [];
  // Secondary roads are fetched but left out: with the street grid they made every district asphalt.
  const kinds: Record<string, RoadKind> = { motorway: 'motorway', trunk: 'trunk', primary: 'primary' };
  for (const el of await layer(def.id, 'roads')) {
    const t = el.tags ?? {};
    const kind: RoadKind | undefined = t['aeroway'] === 'runway' ? 'runway' : kinds[t['highway'] ?? ''];
    if (!kind || !el.geometry) continue;
    const pts = simplify(el.geometry.flatMap((q) => project(p, q.lat, q.lon)), 3);
    roads.push({ kind, pts: pts.map((v) => Math.round(v * 10) / 10) });
  }

  // Tall buildings: real footprint and height, compressed position; the tallest win where they crowd.
  const candidates: MapBuilding[] = [];
  for (const el of await layer(def.id, 'buildings')) {
    const t = el.tags ?? {};
    const h = parseHeight(t);
    if (h < 45 || !el.center || !el.bounds) continue;
    const mpd = metersPerDegree(el.center.lat);
    const hw = Math.min(45, Math.max(10, ((el.bounds.maxlon - el.bounds.minlon) * mpd.lon) / 2));
    const hd = Math.min(45, Math.max(10, ((el.bounds.maxlat - el.bounds.minlat) * mpd.lat) / 2));
    const [x, z] = project(p, el.center.lat, el.center.lon);
    candidates.push({ x: Math.round(x), z: Math.round(z), hw: Math.round(hw), hd: Math.round(hd), h: Math.round(h) });
  }
  candidates.sort((a, b) => b.h - a.h);
  const buildings: MapBuilding[] = [];
  for (const b of candidates) {
    const r = Math.max(b.hw, b.hd);
    if (buildings.every((o) => Math.hypot(o.x - b.x, o.z - b.z) > (r + Math.max(o.hw, o.hd)) * 0.9)) buildings.push(b);
  }

  const towers: MapTower[] = [];
  for (const el of await layer(def.id, 'towers')) {
    const t = el.tags ?? {};
    const name = t['name:en'] ?? t['name'];
    const h = def.towerHeights?.[name ?? ''] ?? parseHeight(t);
    const at = el.center ?? (el.lat !== undefined ? { lat: el.lat, lon: el.lon! } : null);
    if (h < 100 || !at) continue;
    const [x, z] = project(p, at.lat, at.lon);
    towers.push({ x: Math.round(x), z: Math.round(z), h: Math.round(h), ...(name ? { name } : {}) });
  }

  const places: MapPlace[] = [];
  for (const el of await layer(def.id, 'places')) {
    const t = el.tags ?? {};
    const name = t['name:en'] ?? t['name'];
    if (!name || el.lat === undefined) continue;
    const [x, z] = project(p, el.lat, el.lon!);
    places.push({ name, x: Math.round(x), z: Math.round(z), rank: def.majorPlaces.includes(t['place'] ?? '') ? 'major' : 'minor' });
  }

  const [sx, sz] = project(p, def.spawn[0], def.spawn[1]);
  const meta: MapMeta = {
    id: def.id,
    name: def.name,
    cell: def.cell,
    cols: g.cols,
    rows: g.rows,
    minX: g.minX,
    minZ: g.minZ,
    spawn: { x: Math.round(sx), z: Math.round(sz) },
    roads,
    buildings,
    towers,
    places,
    attribution: '© OpenStreetMap contributors (ODbL)',
  };
  const out = resolve(root, 'public/maps');
  await mkdir(out, { recursive: true });
  const bin = gzipSync(g.data, { level: 9 });
  await writeFile(resolve(out, `${def.id}.bin`), bin);
  const json = JSON.stringify(meta);
  await writeFile(resolve(out, `${def.id}.json`), json);
  const counts = new Map<number, number>();
  for (const v of g.data) counts.set(v, (counts.get(v) ?? 0) + 1);
  const names = Object.fromEntries(Object.entries(LAND).map(([k, v]) => [v, k]));
  console.log(`  cover: ${[...counts].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${names[k]} ${Math.round((100 * v) / g.data.length)}%`).join(', ')}`);
  console.log(`  roads ${roads.length}, tall buildings ${buildings.length}/${candidates.length}, towers ${towers.length}, places ${places.length}`);
  console.log(`  wrote ${def.id}.bin (${Math.round(bin.length / 1024)} KB) and ${def.id}.json (${Math.round(json.length / 1024)} KB)`);
}

const id = process.argv[2];
const def = CITY_MAPS.find((m) => m.id === id);
if (!def) {
  console.error(`Unknown map "${id}". Known: ${CITY_MAPS.map((m) => m.id).join(', ')}`);
  process.exit(1);
}
bake(def).catch((err) => {
  console.error(err);
  process.exit(1);
});
