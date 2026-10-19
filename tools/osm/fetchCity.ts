/**
 * Download one city's raw OpenStreetMap layers through the Overpass API into
 * tools/osm/cache/<id>/<layer>.json (git-ignored). Dev-only; run with Node:
 *   npm run map:fetch tokyo            (all layers)
 *   npm run map:fetch tokyo roads      (one layer)
 * Data © OpenStreetMap contributors, ODbL.
 */
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CITY_MAPS } from '../../src/config/maps.ts';

const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'titans-unleashed-mapbuilder/0.1 (game dev tool; low volume)';

type BBox = [number, number, number, number];

interface Layer {
  /** Overpass statements for one bbox string "s,w,n,e"; the tool appends the output mode. */
  body: (bb: string) => string;
  out: string;
  /** Split the bbox into n x n tiles (heavy layers). */
  tiles: number;
}

const re = {
  landuse: '^(commercial|retail|industrial|railway|port|forest|grass|cemetery|recreation_ground|military|meadow)$',
  leisure: '^(park|garden|golf_course|pitch|stadium|nature_reserve)$',
  levels: '^(1[2-9]|[2-9][0-9]|[1-9][0-9][0-9])$',
  height: '^(4[5-9]|[5-9][0-9]|[1-9][0-9][0-9])([.][0-9]+)?( ?m)?$',
};

const LAYERS: Record<string, Layer> = {
  coast: { body: (b) => `way["natural"="coastline"](${b});`, out: 'out geom;', tiles: 1 },
  water: {
    body: (b) =>
      `way["natural"="water"](${b});relation["natural"="water"](${b});` +
      `way["waterway"="riverbank"](${b});relation["waterway"="riverbank"](${b});` +
      `way["landuse"~"^(reservoir|basin)$"](${b});`,
    out: 'out geom;',
    tiles: 3,
  },
  landuse: {
    body: (b) =>
      `way["landuse"~"${re.landuse}"](${b});relation["landuse"~"${re.landuse}"](${b});` +
      `way["leisure"~"${re.leisure}"](${b});relation["leisure"~"${re.leisure}"](${b});` +
      `way["natural"="wood"](${b});relation["natural"="wood"](${b});` +
      `way["aeroway"="aerodrome"](${b});relation["aeroway"="aerodrome"](${b});`,
    out: 'out geom;',
    tiles: 3,
  },
  roads: {
    body: (b) => `way["highway"~"^(motorway|trunk|primary|secondary)$"](${b});way["aeroway"="runway"](${b});`,
    out: 'out geom;',
    tiles: 2,
  },
  buildings: {
    body: (b) =>
      `way["building"]["building:levels"~"${re.levels}"](${b});way["building"]["height"~"${re.height}"](${b});` +
      `relation["building"]["height"~"${re.height}"](${b});relation["building"]["building:levels"~"${re.levels}"](${b});`,
    out: 'out tags center bb;',
    tiles: 5,
  },
  towers: {
    body: (b) => `node["man_made"~"^(tower|mast|communications_tower)$"]["height"](${b});way["man_made"~"^(tower|mast|communications_tower)$"]["height"](${b});relation["man_made"="communications_tower"](${b});relation["man_made"="tower"]["tower:type"="communication"](${b});`,
    out: 'out tags center;',
    tiles: 1,
  },
  places: { body: (b) => `node["place"~"^(city|borough|town|suburb|quarter)$"](${b});`, out: 'out;', tiles: 1 },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(query: string, attempts = 8): Promise<{ elements: { type: string; id: number }[] }> {
  let lastError = '';
  for (let attempt = 0; attempt < attempts; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length]!;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) {
        const json = JSON.parse(text);
        if (json.remark && /runtime error|timed out/i.test(json.remark)) throw new Error(json.remark);
        return json;
      }
      lastError = `${url} → ${res.status}`;
    } catch (e) {
      lastError = `${url} → ${String(e)}`;
    }
    console.warn(`  retry ${attempt + 1}: ${lastError}`);
    await sleep(3000 + attempt * 4000);
  }
  throw new Error(`Overpass failed: ${lastError}`);
}

type Elements = { elements: { type: string; id: number }[] };

/** Fetch one tile; if the servers keep failing on it (too dense), split it into four and retry. */
async function fetchTile(layer: Layer, t: BBox, depth: number): Promise<Elements> {
  const bb = t.map((v) => v.toFixed(5)).join(',');
  try {
    return await overpass(`[out:json][timeout:180];(${layer.body(bb)});${layer.out}`, depth < 2 ? 4 : 8);
  } catch (e) {
    if (depth >= 2) throw e;
    console.log(`  splitting tile (depth ${depth + 1})`);
    const merged: Elements = { elements: [] };
    for (const sub of tiles(t, 2)) merged.elements.push(...(await fetchTile(layer, sub, depth + 1)).elements);
    return merged;
  }
}

function tiles(bbox: BBox, n: number): BBox[] {
  const [s, w, nn, e] = bbox;
  const out: BBox[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      out.push([s + ((nn - s) * i) / n, w + ((e - w) * j) / n, s + ((nn - s) * (i + 1)) / n, w + ((e - w) * (j + 1)) / n]);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const [id, only] = process.argv.slice(2);
  const def = CITY_MAPS.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown map "${id}". Known: ${CITY_MAPS.map((m) => m.id).join(', ')}`);
  const dir = resolve(import.meta.dirname, 'cache', def.id);
  await mkdir(dir, { recursive: true });
  for (const [name, layer] of Object.entries(LAYERS)) {
    if (only && only !== name) continue;
    const file = resolve(dir, `${name}.json`);
    if (!only && (await access(file).then(() => true, () => false))) {
      console.log(`${name}: cached`);
      continue;
    }
    const seen = new Map<string, unknown>();
    const parts = tiles(def.bbox as BBox, layer.tiles);
    const tileFiles: string[] = [];
    for (const [k, t] of parts.entries()) {
      // Each tile is saved as it arrives, so a failed run resumes where it stopped.
      const tileFile = resolve(dir, `${name}.tile${layer.tiles}-${k}.json`);
      tileFiles.push(tileFile);
      let json: { elements: { type: string; id: number }[] };
      try {
        json = JSON.parse(await readFile(tileFile, 'utf8'));
        console.log(`${name}: tile ${k + 1}/${parts.length} (cached)`);
      } catch {
        console.log(`${name}: tile ${k + 1}/${parts.length}`);
        json = await fetchTile(layer, t, 0);
        await writeFile(tileFile, JSON.stringify(json));
        await sleep(1500);
      }
      for (const el of json.elements) seen.set(`${el.type}/${el.id}`, el);
    }
    await writeFile(file, JSON.stringify({ elements: [...seen.values()] }));
    for (const f of tileFiles) await rm(f, { force: true });
    console.log(`${name}: ${seen.size} elements`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
