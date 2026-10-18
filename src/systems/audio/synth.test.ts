import { describe, expect, it } from 'vitest';
import { AUDIO } from '../../config/audio';
import { SYNTH_IDS, synthesize } from './synth';

describe('synth placeholders', () => {
  it('renders every recipe as finite, normalized, non-silent audio', () => {
    for (const id of SYNTH_IDS) {
      const { samples, sampleRate } = synthesize(id);
      expect(sampleRate).toBeGreaterThan(8000);
      expect(samples.length).toBeGreaterThan(sampleRate * 0.2);
      let peak = 0;
      let bad = 0;
      for (const v of samples) {
        if (!Number.isFinite(v)) bad++;
        else peak = Math.max(peak, Math.abs(v));
      }
      expect(bad).toBe(0);
      expect(peak).toBeGreaterThan(0.5);
      expect(peak).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    const a = synthesize('crunch').samples;
    expect(a).toBe(synthesize('crunch').samples);
  });

  it('covers every sound in the mix', () => {
    for (const def of Object.values(AUDIO.sounds)) expect(SYNTH_IDS).toContain(def.synth);
  });
});
