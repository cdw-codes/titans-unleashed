import { describe, expect, it } from 'vitest';
import { CITY } from '../../config/city';
import { TERRAIN } from '../../config/terrain';
import { Terrain } from './Terrain';

const t = new Terrain();

describe('Terrain', () => {
  it('is deterministic', () => {
    const other = new Terrain();
    for (const [x, z] of [[0, 0], [3100, -2200], [-5000, 4400]] as const) {
      expect(other.heightAt(x, z)).toBe(t.heightAt(x, z));
    }
  });

  it('keeps the main city and the spawn flat at y = 0', () => {
    for (const [x, z] of [[0, 0], [600, 300], [CITY.spawnX, CITY.spawnZ], [-1100, 200]] as const) {
      expect(t.heightAt(x, z)).toBeCloseTo(0, 5);
    }
  });

  it('puts the sea past the coast and the seabed under the water', () => {
    const z = 0;
    const x = t.coastX(z) + TERRAIN.shelfWidth + 50;
    expect(t.isSea(x, z)).toBe(true);
    expect(t.heightAt(x, z)).toBeLessThan(TERRAIN.waterLevel - 10);
  });

  it('has hills, lakes, forests and farmland somewhere in the countryside', () => {
    let maxH = 0;
    let lakes = 0;
    const biomes = new Set<string>();
    for (let x = -9000; x < 1200; x += 150) {
      for (let z = -9000; z < 9000; z += 150) {
        if (t.urbanWeight(x, z) > 0) continue;
        const h = t.heightAt(x, z);
        maxH = Math.max(maxH, h);
        if (h < TERRAIN.waterLevel) lakes++;
        biomes.add(t.biomeAt(x, z));
      }
    }
    expect(maxH).toBeGreaterThan(100);
    expect(lakes).toBeGreaterThan(0);
    expect([...biomes].sort()).toEqual(['farmland', 'forest', 'meadow']);
  });

  it('places satellite towns away from the main city and inland', () => {
    let towns = 0;
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const town = t.townInCell(i, j);
        if (!town) continue;
        towns++;
        expect(Math.hypot(town.x, town.z)).toBeGreaterThan(TERRAIN.mainCityRadius + TERRAIN.townGap);
        expect(town.x).toBeLessThan(t.coastX(town.z));
        expect(t.heightAt(town.x, town.z)).toBeCloseTo(0, 5);
      }
    }
    expect(towns).toBeGreaterThan(10);
  });

  it('builds tiles whose heights match heightAt', () => {
    const tile = t.buildTile(2560, -3840, 256, 16, 128);
    expect(tile.heights).toHaveLength(17 * 17);
    expect(tile.colors).toHaveLength(17 * 17 * 3);
    expect(tile.heights[17 * 3 + 5]).toBeCloseTo(t.heightAt(2560 + 5 * 16, -3840 + 3 * 16), 4);
    for (const v of tile.colors) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
