import { describe, expect, it } from 'vitest';
import { CITY } from '../../config/city';
import { CityGenerator } from './CityGenerator';
import { districtAt } from './district';

const gen = new CityGenerator(CITY);
const S = gen.chunkSize;

describe('districtAt', () => {
  it('places downtown at the origin, sea past the coast, docks before it', () => {
    expect(districtAt(0, 0, CITY)).toBe('downtown');
    expect(districtAt(CITY.coastX + 10, 0, CITY)).toBe('sea');
    expect(districtAt(CITY.coastX - 10, 0, CITY)).toBe('docks');
  });

  it('has suburbs and industrial zones in the outer ring', () => {
    const seen = new Set<string>();
    for (let x = -6000; x < 1000; x += 128) for (let z = -6000; z < 6000; z += 128) seen.add(districtAt(x, z, CITY));
    expect(seen).toContain('suburbs');
    expect(seen).toContain('industrial');
    expect(seen).toContain('fringe');
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
    const c = gen.generate(Math.ceil(CITY.coastX / S) + 1, 0);
    expect(c.district).toBe('sea');
    expect(c.structures).toHaveLength(0);
    expect(c.flats).toHaveLength(0);
  });

  it('keeps structures off the streets', () => {
    const W = CITY.streetWidth;
    const pitch = CITY.blockSize + W;
    for (let cx = -4; cx <= 4; cx++) {
      for (let cz = -4; cz <= 4; cz++) {
        for (const s of gen.generate(cx, cz).structures) {
          if (s.kind === 'car') continue;
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

  it('downtown towers are tall and have parts', () => {
    const c = gen.generate(0, 0);
    expect(c.district).toBe('downtown');
    const tallest = Math.max(...c.structures.map((s) => s.height));
    expect(tallest).toBeGreaterThan(80);
    for (const s of c.structures) expect(s.parts.length).toBeGreaterThan(0);
  });
});
