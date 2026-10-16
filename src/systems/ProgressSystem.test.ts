import { describe, expect, it } from 'vitest';
import { DESTRUCTION } from '../config/destruction';
import { ProgressSystem } from './ProgressSystem';

describe('ProgressSystem', () => {
  it('accumulates score and energy per destruction', () => {
    const p = new ProgressSystem(DESTRUCTION);
    p.onDestroyed(200, 'large');
    p.onDestroyed(25, 'small');
    expect(p.score).toBe(225);
    expect(p.destroyed).toBe(2);
    expect(p.energy).toBeCloseTo(DESTRUCTION.energy.large + DESTRUCTION.energy.small);
  });

  it('caps energy and spends it', () => {
    const p = new ProgressSystem(DESTRUCTION);
    for (let i = 0; i < 1000; i++) p.onDestroyed(1, 'large');
    expect(p.energy).toBe(DESTRUCTION.maxEnergy);
    expect(p.spend(30)).toBe(true);
    expect(p.energy).toBe(DESTRUCTION.maxEnergy - 30);
    expect(p.spend(1000)).toBe(false);
  });
});
