import { describe, expect, it } from 'vitest';
import { autoRange, getPath, numericPaths, setPath, TUNABLES } from './tunables';

describe('tunables', () => {
  it('lists numeric leaves, skipping colors and excluded keys', () => {
    const obj = { a: 1, color: 0xffffff, nested: { b: 2, glowColor: 1, c: 'x' }, list: [1, 2], skip: 3 };
    expect(numericPaths(obj, ['skip'])).toEqual(['a', 'nested.b']);
  });

  it('gets and sets dot paths', () => {
    const obj = { walk: { opacity: 0.5 } };
    setPath(obj, 'walk.opacity', 0.7);
    expect(getPath(obj, 'walk.opacity')).toBe(0.7);
  });

  it('auto range contains the value', () => {
    for (const v of [0, 0.035, 13, -0.3, 2000]) {
      const [min, max] = autoRange(v);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });

  it('every tunable has at least one numeric value', () => {
    for (const t of TUNABLES) expect(numericPaths(t.obj, t.exclude).length).toBeGreaterThan(0);
  });
});
