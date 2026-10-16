import { describe, expect, it } from 'vitest';
import { DESTRUCTION as D } from '../../config/destruction';
import type { StructureSpec } from '../../world/city/types';
import { collapseDuration, collapseTrauma, impactDamage, maxHpFor, pointsFor, pushDamage } from './damage';

const spec = (over: Partial<StructureSpec>): StructureSpec => ({
  kind: 'midrise', size: 'large', x: 0, z: 0, halfW: 17, halfD: 17, height: 35, rotY: 0, parts: [], ...over,
});

describe('destruction damage rules', () => {
  it('small structures and props die in one hit', () => {
    expect(maxHpFor(spec({ kind: 'house', size: 'small' }), D)).toBe(1);
    expect(maxHpFor(spec({ kind: 'car', size: 'prop' }), D)).toBe(1);
  });

  it('bigger buildings have more HP, sub-linearly', () => {
    const mid = maxHpFor(spec({}), D);
    const tower = maxHpFor(spec({ kind: 'tower', halfW: 30, halfD: 30, height: 200 }), D);
    expect(tower).toBeGreaterThan(mid * 2);
    expect(tower).toBeLessThan(mid * 10);
  });

  it('a mid-rise falls after ~1-2 s of walking into it, faster when sprinting', () => {
    const hp = maxHpFor(spec({}), D);
    const walkSeconds = hp / pushDamage(1, false, D);
    const sprintSeconds = hp / pushDamage(1, true, D);
    expect(walkSeconds).toBeGreaterThan(0.8);
    expect(walkSeconds).toBeLessThan(2.5);
    expect(sprintSeconds).toBeLessThan(walkSeconds);
  });

  it('sprint impact hurts more than walk impact', () => {
    expect(impactDamage(24, D)).toBeGreaterThan(impactDamage(13, D));
    expect(impactDamage(-5, D)).toBe(0);
  });

  it('awards more points for taller towers', () => {
    expect(pointsFor(spec({ kind: 'tower', height: 200 }), D)).toBeGreaterThan(pointsFor(spec({ kind: 'tower', height: 80 }), D));
  });

  it('clamps collapse duration', () => {
    expect(collapseDuration(1, D)).toBe(D.collapseMinSeconds);
    expect(collapseDuration(10000, D)).toBe(D.collapseMaxSeconds);
  });

  it('collapse trauma falls off to zero with distance', () => {
    expect(collapseTrauma(100, 0, D)).toBeCloseTo(D.collapseTraumaPer100m);
    expect(collapseTrauma(100, D.traumaFalloffDistance, D)).toBe(0);
  });
});
