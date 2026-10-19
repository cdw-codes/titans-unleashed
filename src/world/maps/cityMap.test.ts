import { describe, expect, it } from 'vitest';
import { CityMap } from './CityMap';
import { LAND, project, type MapMeta } from './format';

/** 8 x 8 cells of 16 m from (0, 0): sea on the right half, a park in the top-left corner. */
function synthetic(): CityMap {
  const cols = 8;
  const grid = new Uint8Array(64).fill(LAND.urban);
  for (let r = 0; r < 8; r++) for (let c = 4; c < 8; c++) grid[r * cols + c] = LAND.sea;
  grid[0] = LAND.park;
  const meta: MapMeta = {
    id: 'test', name: 'Test', cell: 16, cols, rows: 8, minX: 0, minZ: 0, spawn: { x: 10, z: 10 },
    roads: [{ kind: 'primary', pts: [0, 40, 300, 40] }],
    buildings: [{ x: 20, z: 20, hw: 20, hd: 15, h: 180 }],
    towers: [{ x: 30, z: 30, h: 333, name: 'Mast' }],
    places: [{ name: 'Harbor', x: 100, z: 60, rank: 'major' }, { name: 'Lane', x: 10, z: 10, rank: 'minor' }],
    attribution: '© test',
  };
  return new CityMap(meta, grid, 256);
}

describe('CityMap', () => {
  it('looks up land cover and knows its edges', () => {
    const m = synthetic();
    expect(m.classAt(4, 4)).toBe(LAND.park);
    expect(m.classAt(100, 10)).toBe(LAND.sea);
    expect(m.classAt(-1, 10)).toBe(-1);
    expect(m.inside(127, 127)).toBe(true);
    expect(m.outsideDistance(140, 64)).toBeCloseTo(12, 5);
    expect(m.outsideDistance(64, 64)).toBeLessThan(0);
  });

  it('smooths water across the shore', () => {
    const m = synthetic();
    expect(m.waterWeight(20, 60)).toBe(0);
    expect(m.waterWeight(110, 60)).toBe(1);
    const shore = m.waterWeight(64, 60);
    expect(shore).toBeGreaterThan(0.2);
    expect(shore).toBeLessThan(0.8);
  });

  it('cuts roads into pieces bucketed by chunk', () => {
    const m = synthetic();
    const pieces = [...m.roadsIn(0, 0), ...m.roadsIn(1, 0)];
    expect(pieces.length).toBeGreaterThanOrEqual(5);
    const total = pieces.reduce((n, p) => n + p.length, 0);
    expect(total).toBeCloseTo(300, 5);
    for (const p of m.roadsIn(1, 0)) expect(p.x).toBeGreaterThanOrEqual(256);
  });

  it('buckets buildings and towers, and announces only major places', () => {
    const m = synthetic();
    expect(m.buildingsIn(0, 0)).toHaveLength(1);
    expect(m.towersIn(0, 0)[0]!.h).toBe(333);
    expect(m.placeAt(90, 60)).toBe('Harbor');
    expect(m.placeAt(10, 10, 50)).toBeNull();
  });
});

describe('project', () => {
  it('maps north to -z, east to +x and compresses distances', () => {
    const p = { lat0: 35.6, lon0: 139.7, compress: 3.5 };
    const [x, z] = project(p, 35.6 + 0.01, 139.7 + 0.01);
    expect(z).toBeCloseTo(-1105.74 / 3.5, 0);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1113.2 / 3.5);
  });
});
