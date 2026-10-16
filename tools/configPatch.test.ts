import { describe, expect, it } from 'vitest';
import { formatNumber, patchConfigSource } from './configPatch.ts';

const SRC = `import x from 'y';

export interface Foo { a: number }

/** Movement. */
export const MOVE: Foo = {
  walkSpeed: 13,
  // comment with a: 5 inside
  turnRate: 1.35, // trailing comment
  noise: 1 / 1100,
  color: 0x9d927d,
  minPitch: -0.3,
  walk: {
    opacity: 0.8,
    count: 12,
  },
  sprint: {
    opacity: 0.9,
  },
  opacity: 0.1,
};

export const OTHER = {
  walkSpeed: 99,
};
`;

describe('patchConfigSource', () => {
  it('replaces top-level literals and keeps comments and other exports', () => {
    const r = patchConfigSource(SRC, 'MOVE', { walkSpeed: 15.5, turnRate: 2, minPitch: -0.25 });
    expect(r.applied).toEqual(['walkSpeed', 'turnRate', 'minPitch']);
    expect(r.source).toContain('walkSpeed: 15.5,');
    expect(r.source).toContain('turnRate: 2, // trailing comment');
    expect(r.source).toContain('minPitch: -0.25,');
    expect(r.source).toContain('walkSpeed: 99,'); // OTHER untouched
    expect(r.source).toContain('// comment with a: 5 inside');
  });

  it('targets nested paths without touching same-named keys elsewhere', () => {
    const r = patchConfigSource(SRC, 'MOVE', { 'walk.opacity': 0.5, opacity: 0.2 });
    expect(r.source).toContain('walk: {\n    opacity: 0.5,');
    expect(r.source).toContain('sprint: {\n    opacity: 0.9,');
    expect(r.source).toContain('  opacity: 0.2,\n};');
  });

  it('skips expressions, hex colors and unknown keys', () => {
    const r = patchConfigSource(SRC, 'MOVE', { noise: 0.001, color: 5, nope: 1, 'walk.nope': 1 });
    expect(r.applied).toEqual([]);
    expect(r.skipped).toEqual(['noise', 'color', 'nope', 'walk.nope']);
    expect(r.source).toBe(SRC);
  });

  it('throws on a missing export', () => {
    expect(() => patchConfigSource(SRC, 'MISSING', { a: 1 })).toThrow();
  });
});

describe('formatNumber', () => {
  it('trims float noise', () => {
    expect(formatNumber(0.30000000000000004)).toBe('0.3');
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(1.23456789)).toBe('1.23457');
  });
});
