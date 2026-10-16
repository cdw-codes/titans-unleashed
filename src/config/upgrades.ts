export type UpgradeId = 'hide' | 'core' | 'charge' | 'reactor' | 'stride' | 'weight' | 'pulse';

export interface UpgradeDef {
  readonly name: string;
  readonly description: string;
  /** Times it can be taken. */
  readonly maxStacks: number;
  /** Per-stack effect size (meaning depends on the upgrade). */
  readonly amount: number;
}

/** Evolutions offered after defeating a rival (pick 1 of `choices`). */
export const UPGRADES: Readonly<Record<UpgradeId, UpgradeDef>> = {
  hide: { name: 'Thick Hide', description: '+25% max health', maxStacks: 3, amount: 0.25 },
  core: { name: 'Atomic Core', description: '+25% beam damage', maxStacks: 3, amount: 0.25 },
  charge: { name: 'Rapid Charge', description: 'Beam charges 25% faster', maxStacks: 2, amount: 0.25 },
  reactor: { name: 'Reactor Heart', description: '+30% energy from destruction', maxStacks: 2, amount: 0.3 },
  stride: { name: 'Titan Stride', description: '+12% movement speed', maxStacks: 2, amount: 0.12 },
  weight: { name: 'Crushing Weight', description: '+40% claw, tail and stomp damage', maxStacks: 2, amount: 0.4 },
  pulse: { name: 'Atomic Pulse', description: 'New move (F): an all-around energy blast', maxStacks: 1, amount: 1 },
};

export const UPGRADE_CHOICES = 3;
