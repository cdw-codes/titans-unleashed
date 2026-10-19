import { describe, expect, it } from 'vitest';
import { CITY } from '../../config/city';
import { CityGenerator } from './CityGenerator';
import { districtAt } from './district';
import { terrain } from '../terrain/Terrain';

const gen = new CityGenerator(CITY);
const S = gen.chunkSize;
const URBAN = new Set(['downtown', 'fringe', 'suburbs', 'industrial', 'docks']);

describe('districtAt', () => {
  it('puts downtown at the origin and sea past the coast', () => {
    expect(districtAt(-S / 2, -S / 2, S, terrain, CITY)).toBe('downtown');
    const z = -2500; // between the island (south) and the Alps (north)
    expect(districtAt(terrain.coastX(z) + 800, z, S, terrain, CITY)).toBe('sea');
  });

  it('has every town district and countryside biome somewhere', () => {
    const seen = new Set<string>();
    for (let x = -8000; x < 2400; x += S) for (let z = -8000; z < 8000; z += S) seen.add(districtAt(x, z, S, terrain, CITY));
    for (const d of ['downtown', 'fringe', 'suburbs', 'industrial', 'docks', 'airport', 'plant', 'forest', 'farmland', 'meadow', 'sea']) {
      expect(seen).toContain(d);
    }
  });
});

describe('CityGenerator', () => {
  it('is deterministic per chunk', () => {
    expect(JSON.stringify(gen.generate(3, -2))).toBe(JSON.stringify(new CityGenerator(CITY).generate(3, -2)));
  });

  it('differs between chunks', () => {
    expect(JSON.stringify(gen.generate(3, -2).structures)).not.toBe(JSON.stringify(gen.generate(4, -2).structures));
  });

  it('leaves sea chunks empty', () => {
    const c = gen.generate(Math.ceil((terrain.coastX(-2500) + 800) / S), Math.floor(-2500 / S));
    expect(c.district).toBe('sea');
    expect(c.structures).toHaveLength(0);
    expect(c.flats).toHaveLength(0);
  });

  it('keeps structures off the streets', () => {
    const W = CITY.streetWidth;
    const pitch = CITY.blockSize + W;
    for (let cx = -4; cx <= 4; cx++) {
      for (let cz = -4; cz <= 4; cz++) {
        const chunk = gen.generate(cx, cz);
        if (!URBAN.has(chunk.district)) continue;
        for (const s of chunk.structures) {
          // Cars park on streets; bridges and landmarks are placed by hand.
          // ...and street trees stand on the sidewalks.
          if (['car', 'tree', 'bridge', 'mast', 'stadium', 'pylon'].includes(s.kind)) continue;
          // Distance from the center to the nearest street line, per axis.
          for (const [v, half] of [[s.x, s.rotY ? s.halfD : s.halfW], [s.z, s.rotY ? s.halfW : s.halfD]] as const) {
            const local = ((v % pitch) + pitch) % pitch;
            const toStreet = Math.min(local, pitch - local);
            expect(toStreet + 0.01).toBeGreaterThanOrEqual(half + W / 2 - 0.5);
          }
        }
      }
    }
  });

  it('keeps the spawn clear', () => {
    const cx = Math.floor(CITY.spawnX / S);
    const cz = Math.floor(CITY.spawnZ / S);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const s of gen.generate(cx + dx, cz + dz).structures) {
          expect(Math.hypot(s.x - CITY.spawnX, s.z - CITY.spawnZ)).toBeGreaterThan(CITY.spawnClearRadius);
        }
      }
    }
  });

  it('puts countryside structures on the terrain and keeps them out of the water', () => {
    let checked = 0;
    for (let cx = -30; cx <= -20; cx++) {
      for (let cz = -5; cz <= 5; cz++) {
        const chunk = gen.generate(cx, cz);
        if (URBAN.has(chunk.district)) continue;
        for (const s of chunk.structures) {
          expect(s.y).toBeGreaterThan(terrain.waterLevel);
          expect(Math.abs(s.y - terrain.heightAt(s.x, s.z))).toBeLessThan(25);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('downtown towers are tall and have parts', () => {
    const c = gen.generate(0, 0);
    expect(c.district).toBe('downtown');
    const tallest = Math.max(...c.structures.map((s) => s.height));
    expect(tallest).toBeGreaterThan(80);
    for (const s of c.structures) expect(s.parts.length).toBeGreaterThan(0);
  });
});
