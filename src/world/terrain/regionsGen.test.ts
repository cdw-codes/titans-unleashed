import { describe, expect, it } from 'vitest';
import { Terrain } from './Terrain';

const world = (seed: number) => {
  const t = new Terrain();
  t.reseed(seed);
  return t;
};

describe('seeded open worlds', () => {
  it('is deterministic per seed and different between seeds', () => {
    const a = world(4242);
    const b = world(4242);
    const c = world(4243);
    expect(JSON.stringify(a.r)).toBe(JSON.stringify(b.r));
    expect(a.heightAt(-3000, 2000)).toBe(b.heightAt(-3000, 2000));
    expect(JSON.stringify(a.r.island)).not.toBe(JSON.stringify(c.r.island));
  });

  it('produces playable layouts across many seeds', () => {
    for (let seed = 1; seed <= 400; seed += 7) {
      const t = world(seed);
      // Spawn: flat, dry town ground off the river.
      expect(t.heightAt(t.spawn.x, t.spawn.z), `seed ${seed} spawn`).toBeCloseTo(0, 3);
      expect(t.riverDistance(t.spawn.x, t.spawn.z)).toBeGreaterThan(200);
      // Flat sites on dry land; the island out at sea and flat.
      for (const site of t.authored) {
        if (site.kind !== 'airport' && site.kind !== 'plant') continue; // rivers run through the cities by design
        expect(t.isWater(site.x, site.z), `seed ${seed} ${site.kind}`).toBe(false);
      }
      expect(t.heightAt(t.island.x, t.island.z)).toBeCloseTo(0, 3);
      expect(t.island.x).toBeGreaterThan(t.coastX(t.island.z));
      // Mountains rise on the chosen side, away from the main city.
      const a = t.r.alps;
      expect(Math.abs(a.startZ)).toBeGreaterThan(4000);
      expect(Math.sign(a.fullZ - a.startZ)).toBe(Math.sign(a.startZ));
    }
  });
});
