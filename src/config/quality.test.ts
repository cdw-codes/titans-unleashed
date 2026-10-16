import { describe, expect, it } from 'vitest';
import { QUALITY_LEVELS, QUALITY_PRESETS, resolveQualityLevel } from './quality';

describe('resolveQualityLevel', () => {
  it('prefers the URL param', () => {
    expect(resolveQualityLevel('high', 'low')).toBe('high');
  });
  it('falls back to stored, then default', () => {
    expect(resolveQualityLevel(null, 'low')).toBe('low');
    expect(resolveQualityLevel('ultra', 'nope')).toBe('medium');
  });
});

describe('QUALITY_PRESETS', () => {
  it('scale monotonically from low to high', () => {
    const keys = ['shadowMapSize', 'drawDistance', 'debrisCap', 'maxPixelRatio'] as const;
    for (const k of keys) {
      const values = QUALITY_LEVELS.map((l) => QUALITY_PRESETS[l][k]);
      expect([...values].sort((a, b) => a - b)).toEqual(values);
    }
  });
  it('disables post-processing on low', () => {
    expect(QUALITY_PRESETS.low.postProcessing).toBe(false);
  });
});
