import { UPGRADES, type UpgradeId } from '../../config/upgrades';

/** Multipliers a titan's systems read at their point of use. Base configs are never mutated. */
export interface TitanModifiers {
  maxHealth: number;
  beamDamage: number;
  /** Multiplies beam charge time (< 1 = faster). */
  chargeTime: number;
  energyGain: number;
  moveSpeed: number;
  meleeDamage: number;
  pulse: boolean;
}

export const baseModifiers = (): TitanModifiers => ({
  maxHealth: 1, beamDamage: 1, chargeTime: 1, energyGain: 1, moveSpeed: 1, meleeDamage: 1, pulse: false,
});

/** Owned upgrades → modifiers. Pure. */
export function modifiersFor(owned: Readonly<Partial<Record<UpgradeId, number>>>): TitanModifiers {
  const m = baseModifiers();
  const n = (id: UpgradeId) => owned[id] ?? 0;
  m.maxHealth += UPGRADES.hide.amount * n('hide');
  m.beamDamage += UPGRADES.core.amount * n('core');
  m.chargeTime *= Math.pow(1 - UPGRADES.charge.amount, n('charge'));
  m.energyGain += UPGRADES.reactor.amount * n('reactor');
  m.moveSpeed += UPGRADES.stride.amount * n('stride');
  m.meleeDamage += UPGRADES.weight.amount * n('weight');
  m.pulse = n('pulse') > 0;
  return m;
}

/** Up to `count` distinct upgrades not yet maxed out, in random order. */
export function rollChoices(owned: Readonly<Partial<Record<UpgradeId, number>>>, count: number, rand: () => number): UpgradeId[] {
  const pool = (Object.keys(UPGRADES) as UpgradeId[]).filter((id) => (owned[id] ?? 0) < UPGRADES[id].maxStacks);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}
