import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Terrain } from './Terrain';
import { CityMap } from '../maps/CityMap';

/** Steepest slope (deg) around water: anything a titan in the water has to climb out over. */
function steepestShore(t: Terrain, x0: number, z0: number, x1: number, z1: number, stride: number): number {
  const step = 4;
  const wet = t.waterLevel + 2;
  let worst = 0;
  for (let x = x0; x < x1; x += stride) {
    for (let z = z0; z < z1; z += stride) {
      const h = t.heightAt(x, z);
      const hx = t.heightAt(x + step, z);
      const hz = t.heightAt(x, z + step);
      if (h > wet && hx > wet && hz > wet) continue;
      worst = Math.max(worst, Math.atan(Math.max(Math.abs(hx - h), Math.abs(hz - h)) / step));
    }
  }
  return (worst * 180) / Math.PI;
}

/** Shores stay an easy walk (well under the controller's climb limit), not a scramble. */
const limit = 38;

describe('titans can climb out of any water', () => {
  it('open worlds: sea shelves, lake basins, river banks', () => {
    for (const seed of [4242, 19684, 7]) {
      const t = new Terrain();
      t.reseed(seed);
      expect(steepestShore(t, -8000, -8000, 8000, 8000, 61), `seed ${seed}`).toBeLessThan(limit);
    }
  });

  for (const id of ['tokyo', 'newyork', 'london', 'paris', 'sanfrancisco', 'hongkong', 'sydney']) {
    const base = `public/maps/${id}`;
    it.skipIf(!existsSync(`${base}.json`))(`${id}: quays and river banks`, () => {
      const meta = JSON.parse(readFileSync(`${base}.json`, 'utf8'));
      const t = new Terrain();
      t.setMap(new CityMap(meta, new Uint8Array(gunzipSync(readFileSync(`${base}.bin`)))));
      const m = t.map!;
      // Titans are held 250 m inside the data edge (Game MAP_EDGE), where rivers end abruptly.
      const e = 250;
      expect(steepestShore(t, m.meta.minX + e, m.meta.minZ + e, m.maxX - e, m.maxZ - e, 23)).toBeLessThan(limit);
    });
  }
});
