import { describe, expect, it } from 'vitest';
import { drawLines, fillPolygon, floodFill, makeGrid, ringsToSegments, simplify } from './raster';

const square = (x0: number, z0: number, x1: number, z1: number) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];

describe('map raster', () => {
  it('fills a polygon and leaves holes from inner rings', () => {
    const g = makeGrid(0, 0, 100, 100, 10, 0);
    fillPolygon(g, ringsToSegments([square(0, 0, 100, 100), square(30, 30, 70, 70)]), 5);
    expect(g.data[0]).toBe(5);
    expect(g.data[5 * 10 + 5]).toBe(0); // inside the hole
    expect(g.data[1 * 10 + 8]).toBe(5);
  });

  it('flood-fills one side of a line without leaking through diagonals', () => {
    const g = makeGrid(0, 0, 100, 100, 10, 0);
    const barrier = new Uint8Array(100);
    // A diagonal "coastline" from the top-left to the bottom-right corner.
    drawLines(g, [[0, 0, 100, 100]], barrier);
    floodFill(g, [[90, 5]], barrier, 9);
    expect(g.data[0 * 10 + 9]).toBe(9); // top-right: sea side
    expect(g.data[9 * 10 + 0]).toBe(0); // bottom-left: land side untouched
  });

  it('simplifies straight runs to their end points', () => {
    expect(simplify([0, 0, 1, 0.01, 2, 0, 3, 0], 0.5)).toEqual([0, 0, 3, 0]);
    expect(simplify([0, 0, 5, 5, 10, 0], 0.5)).toEqual([0, 0, 5, 5, 10, 0]);
  });
});
