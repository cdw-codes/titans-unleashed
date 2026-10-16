import { describe, expect, it } from 'vitest';
import { MILITARY } from '../../config/military';
import { UPGRADES } from '../../config/upgrades';
import { Random } from '../../core/random';
import { Threat } from '../military/Threat';
import { modifiersFor, rollChoices } from './Upgrades';

describe('Threat', () => {
  it('rises through levels with destruction', () => {
    const t = new Threat(MILITARY.threat);
    expect(t.level).toBe(0);
    t.addDestruction(MILITARY.threat.levelThresholds[0]!);
    expect(t.level).toBe(1);
    t.addDestruction(1e9);
    expect(t.level).toBe(5);
    expect(t.heat).toBe(MILITARY.threat.maxHeat);
  });

  it('only cools after a calm period, then drops to zero', () => {
    const t = new Threat(MILITARY.threat);
    t.addDestruction(6000);
    t.update(MILITARY.threat.calmDelay - 1);
    expect(t.heat).toBe(6000);
    for (let i = 0; i < 120 * 10; i++) t.update(0.1);
    expect(t.level).toBe(0);
  });

  it('new destruction resets the calm timer', () => {
    const t = new Threat(MILITARY.threat);
    t.addDestruction(3000);
    t.update(MILITARY.threat.calmDelay - 1);
    t.addDestruction(1);
    t.update(MILITARY.threat.calmDelay - 1);
    expect(t.heat).toBe(3001);
  });

  it('reports progress toward the next level', () => {
    const t = new Threat(MILITARY.threat);
    const [a, b] = MILITARY.threat.levelThresholds;
    t.addDestruction(a! + (b! - a!) / 2);
    expect(t.progress).toBeCloseTo(0.5);
  });
});

describe('Upgrades', () => {
  it('stack into modifiers', () => {
    const m = modifiersFor({ hide: 2, charge: 1, pulse: 1 });
    expect(m.maxHealth).toBeCloseTo(1 + 2 * UPGRADES.hide.amount);
    expect(m.chargeTime).toBeCloseTo(1 - UPGRADES.charge.amount);
    expect(m.pulse).toBe(true);
    expect(m.beamDamage).toBe(1);
  });

  it('offers distinct choices and never a maxed upgrade', () => {
    const rng = new Random(3);
    for (let i = 0; i < 50; i++) {
      const c = rollChoices({ pulse: 1, hide: 3 }, 3, () => rng.next());
      expect(new Set(c).size).toBe(3);
      expect(c).not.toContain('pulse');
      expect(c).not.toContain('hide');
    }
  });

  it('offers fewer choices when almost everything is maxed', () => {
    const all = Object.fromEntries(Object.entries(UPGRADES).map(([k, v]) => [k, v.maxStacks]));
    expect(rollChoices({ ...all, core: 0 }, 3, Math.random)).toEqual(['core']);
  });
});
