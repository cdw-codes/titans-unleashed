import { describe, expect, it } from 'vitest';
import { chunksInRadius, chunksOverlappingCircle } from './chunkMath';
import { DestructionState } from './DestructionState';

describe('chunksInRadius', () => {
  it('returns chunks nearest first, all within radius', () => {
    const list = chunksInRadius(10, 10, 600, 256);
    expect(list[0]).toMatchObject({ cx: 0, cz: 0 });
    for (let i = 1; i < list.length; i++) expect(list[i]!.dist).toBeGreaterThanOrEqual(list[i - 1]!.dist);
    for (const c of list) expect(c.dist).toBeLessThanOrEqual(600);
  });

  it('roughly covers the circle area', () => {
    const n = chunksInRadius(0, 0, 2000, 256).length;
    const expected = (Math.PI * 2000 * 2000) / (256 * 256);
    expect(Math.abs(n - expected) / expected).toBeLessThan(0.15);
  });

  it('works at negative coordinates', () => {
    expect(chunksInRadius(-300, -300, 200, 256)[0]).toMatchObject({ cx: -2, cz: -2 });
  });
});

describe('chunksOverlappingCircle', () => {
  it('finds the 4 chunks around a corner', () => {
    expect(chunksOverlappingCircle(256, 256, 10, 256)).toHaveLength(4);
    expect(chunksOverlappingCircle(128, 128, 10, 256)).toEqual([[0, 0]]);
  });
});

describe('DestructionState', () => {
  it('persists destroyed indices per chunk', () => {
    const s = new DestructionState();
    s.markDestroyed(1, -2, 7);
    expect(s.isDestroyed(1, -2, 7)).toBe(true);
    expect(s.isDestroyed(1, -2, 8)).toBe(false);
    expect(s.isDestroyed(-2, 1, 7)).toBe(false);
    expect(s.countIn(1, -2)).toBe(1);
  });
});
