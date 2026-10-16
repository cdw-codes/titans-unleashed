import type { StructureKind } from '../world/city/types';

export interface DestructionConfig {
  /** Large-structure HP = sqrt(volume m³) * this. sqrt keeps towers tough but not absurd. */
  readonly hpPerSqrtVolume: number;
  readonly minHp: number;
  /** Damage/s while the kaiju pushes into a large structure (walk), and sprint multiplier. */
  readonly pushDps: number;
  readonly sprintPushMultiplier: number;
  /** One-off damage on first contact, per m/s of speed at impact. */
  readonly impactDamagePerMps: number;
  /** Seconds without contact before a new contact counts as a fresh impact. */
  readonly impactCooldown: number;
  /** Footstep: radius (m, at kaiju scale 1) that crushes small structures/props, and damage to large ones in reach. */
  readonly footCrushRadius: number;
  readonly footstepDamage: number;
  /** Body radius multiplier for crushing small things the kaiju walks through. */
  readonly bodyCrushRadiusScale: number;
  /** Large structures darken toward this fraction of their color as HP drops. */
  readonly damagedDarken: number;

  /** Collapse animation seconds per meter of height, clamped. */
  readonly collapseSecondsPerMeter: number;
  readonly collapseMinSeconds: number;
  readonly collapseMaxSeconds: number;
  /** Rubble mound height as a fraction of building height, clamped (m). */
  readonly rubbleHeightFraction: number;
  readonly rubbleMinHeight: number;
  readonly rubbleMaxHeight: number;

  /** Debris pieces spawned per collapse, per 10 m of height (clamped to the preset cap). */
  readonly debrisPer10m: number;
  readonly debrisMaxPerCollapse: number;
  readonly debrisLifetime: number;
  readonly debrisFadeTime: number;

  /** Hit-pause (s) when a structure of at least this height starts collapsing. */
  readonly hitPauseMinHeight: number;
  readonly hitPauseSeconds: number;
  /** Camera trauma for a collapse at the camera: scales with height, falls off with distance. */
  readonly collapseTraumaPer100m: number;
  readonly traumaFalloffDistance: number;

  /** Points and energy per destroyed structure. */
  readonly points: Readonly<Record<StructureKind, number>>;
  /** Extra points per meter of height for large structures. */
  readonly pointsPerMeter: number;
  readonly energy: Readonly<Record<'large' | 'small' | 'prop', number>>;
  readonly maxEnergy: number;
}

export const DESTRUCTION: DestructionConfig = {
  hpPerSqrtVolume: 1,
  minHp: 60,
  pushDps: 140,
  sprintPushMultiplier: 2.2,
  impactDamagePerMps: 9,
  impactCooldown: 0.6,
  footCrushRadius: 14,
  footstepDamage: 60,
  bodyCrushRadiusScale: 1.1,
  damagedDarken: 0.55,

  collapseSecondsPerMeter: 0.025,
  collapseMinSeconds: 1.2,
  collapseMaxSeconds: 4.5,
  rubbleHeightFraction: 0.12,
  rubbleMinHeight: 2,
  rubbleMaxHeight: 16,

  debrisPer10m: 2,
  debrisMaxPerCollapse: 40,
  debrisLifetime: 7,
  debrisFadeTime: 1.2,

  hitPauseMinHeight: 45,
  hitPauseSeconds: 0.07,
  collapseTraumaPer100m: 0.55,
  traumaFalloffDistance: 600,

  points: {
    tower: 500,
    midrise: 200,
    warehouse: 150,
    chimney: 120,
    tank: 100,
    shop: 40,
    house: 25,
    tree: 2,
    car: 5,
    container: 3,
  },
  pointsPerMeter: 3,
  energy: { large: 6, small: 1.5, prop: 0.2 },
  maxEnergy: 100,
};
