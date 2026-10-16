import { describe, expect, it } from 'vitest';
import { approachAngle, damp, noise1D, Spring, wrapAngle } from './math';

describe('math', () => {
  it('wrapAngle keeps angles in [-PI, PI)', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('approachAngle turns the short way across the seam', () => {
    const r = approachAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.05);
    expect(wrapAngle(r - (Math.PI - 0.05))).toBeCloseTo(0, 6);
  });

  it('damp is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 10, 0.5, 1 / 60);
    let b = 0;
    for (let i = 0; i < 6; i++) b = damp(b, 10, 0.5, 1 / 6);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeCloseTo(7.5, 1); // two half-lives
  });

  it('noise1D is smooth, bounded and deterministic', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const n = noise1D(t, 3);
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
      expect(noise1D(t, 3)).toBe(n);
      expect(Math.abs(noise1D(t + 0.001, 3) - n)).toBeLessThan(0.01);
    }
  });

  it('Spring returns to rest after an impulse', () => {
    const s = new Spring(2, 0.6);
    s.impulse(-10);
    for (let i = 0; i < 600; i++) s.update(1 / 60);
    expect(Math.abs(s.value)).toBeLessThan(0.01);
  });
});
