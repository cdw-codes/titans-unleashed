import { describe, expect, it } from 'vitest';
import { Terrain } from './Terrain';

const world = (seed: number) => {
  const t = new Terrain();
  t.reseed(seed);
  return t;
};

describe('seeded open worlds', () => {
  it('varies the coastline shape and direction between seeds', () => {
    const kinds = new Set<string>();
    const sides = new Set<string>();
    for (let seed = 1; seed <= 120; seed++) {
      const t = world(seed);
      if (!t.r.shore) continue; // a rare seed falls back to the classic layout
      kinds.add(t.r.shore.kind);
      const [nx, nz] = t.r.shore.planes[0]!;
      sides.add(Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 'E' : 'W') : nz > 0 ? 'S' : 'N');
    }
    expect([...kinds].sort()).toEqual(['bay', 'coast', 'peninsula', 'strait']);
    expect(sides.size).toBe(4);
  });

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
      if (!t.r.shore) continue;
      // Spawn: flat, dry town ground off the river.
      expect(t.heightAt(t.spawn.x, t.spawn.z), `seed ${seed} spawn`).toBeCloseTo(0, 3);
      expect(t.riverDistance(t.spawn.x, t.spawn.z)).toBeGreaterThan(200);
      // Flat sites on dry land; the island out at sea and flat.
      for (const site of t.authored) {
        if (site.kind !== 'airport' && site.kind !== 'plant') continue; // rivers run through the cities by design
        expect(t.isWater(site.x, site.z), `seed ${seed} ${site.kind}`).toBe(false);
      }
      expect(t.heightAt(t.island.x, t.island.z)).toBeCloseTo(0, 3);
      expect(t.seaDist(t.island.x, t.island.z), `seed ${seed} island offshore`).toBeGreaterThan(0);
      // Mountains rise away from the main city, on land.
      const a = t.r.alps;
      expect(a.startZ).toBeGreaterThan(4000);
      expect(a.fullZ).toBeGreaterThan(a.startZ);
      expect(t.alpsWeight(0, 0)).toBe(0);
      // The sea is somewhere around, but the city stands on land.
      expect(t.seaDist(0, 0)).toBeLessThan(-1000);
    }
  });
});
