import { describe, expect, it } from 'vitest';
import { FixedStepper } from './FixedStepper';

describe('FixedStepper', () => {
  it('runs one step per 60 Hz frame at 60 Hz', () => {
    const s = new FixedStepper(60, 5, 0.25);
    let total = 0;
    for (let i = 0; i < 60; i++) total += s.advance(1 / 60).steps;
    expect(total).toBeGreaterThanOrEqual(59);
    expect(total).toBeLessThanOrEqual(60);
  });

  it('runs ~2.4 steps per frame at 25 FPS and keeps sim time in sync', () => {
    const s = new FixedStepper(60, 5, 0.25);
    let total = 0;
    for (let i = 0; i < 25; i++) total += s.advance(1 / 25).steps;
    expect(Math.abs(total - 60)).toBeLessThanOrEqual(1);
  });

  it('interpolates at high refresh rates (144 Hz)', () => {
    const s = new FixedStepper(60, 5, 0.25);
    const r = s.advance(1 / 144);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(60 / 144, 5);
  });

  it('caps steps and reports dropped time on a long frame', () => {
    const s = new FixedStepper(60, 5, 1);
    const r = s.advance(0.5);
    expect(r.steps).toBe(5);
    expect(r.dropped).toBeCloseTo(0.5 - 5 / 60, 1);
    expect(r.alpha).toBeGreaterThanOrEqual(0);
    expect(r.alpha).toBeLessThan(1);
  });

  it('clamps huge deltas (tab switch) to maxFrameDelta', () => {
    const s = new FixedStepper(60, 100, 0.25);
    expect(s.advance(30).steps).toBe(15);
  });

  it('ignores negative deltas', () => {
    const s = new FixedStepper(60, 5, 0.25);
    expect(s.advance(-1).steps).toBe(0);
  });

  it('alpha always stays in [0, 1)', () => {
    const s = new FixedStepper(60, 5, 0.25);
    for (let i = 0; i < 1000; i++) {
      const r = s.advance(Math.random() * 0.05);
      expect(r.alpha).toBeGreaterThanOrEqual(0);
      expect(r.alpha).toBeLessThan(1);
    }
  });
});
