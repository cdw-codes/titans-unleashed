import { describe, expect, it } from 'vitest';
import { QUALITY_LEVELS, QUALITY_PRESETS, resolveQualityLevel } from './quality';

describe('resolveQualityLevel', () => {
  it('uses a valid URL param', () => {
    expect(resolveQualityLevel('high')).toBe('high');
  });
  it('falls back to the default', () => {
    expect(resolveQualityLevel(null)).toBe('medium');
    expect(resolveQualityLevel('ultra')).toBe('medium');
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
