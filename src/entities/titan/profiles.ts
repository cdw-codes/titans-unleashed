import type { CombatConfig, MoveConfig } from '../../config/combat';
import type { TitanBodyConfig, TitanGaitConfig, TitanMovementConfig } from '../../config/titan';

/**
 * A titan's field dossier: real size and weight, flavor (classification, origin,
 * abilities) and five ratings that shape how it plays. Ratings run 1..5 and always
 * spend the same budget, so every specimen is a trade-off, never strictly better.
 * Pure data + pure functions (tested).
 */
export interface TitanRatings {
  /** Melee damage to titans and structures, poise damage. */
  power: number;
  /** Health. */
  armor: number;
  /** Walk / sprint speed and acceleration. */
  speed: number;
  /** Turning and stopping. */
  agility: number;
  /** Beam damage, charge time and reach. */
  beam: number;
}

export const RATING_KEYS = ['power', 'armor', 'speed', 'agility', 'beam'] as const;
/** Every titan's ratings add up to this (3 each = the reference titan). */
export const RATING_BUDGET = 15;

export interface TitanProfile {
  /** Standing height to the highest point (m); the model is scaled to it. */
  readonly height: number;
  /** Nose to tail tip (m). */
  readonly length: number;
  /** Tonnes. Heavier = more stagger resistance and heavier footfalls. */
  readonly weight: number;
  readonly classification: string;
  readonly origin: string;
  readonly abilities: readonly string[];
  readonly ratings: Readonly<TitanRatings>;
}

/** The reference titan everything is scaled from (the config defaults are tuned for it). */
export const REFERENCE = { height: 100, weight: 90000 };

/** Rating 1..5 → multiplier around 1 (3 = 1). */
export const ratingMultiplier = (rating: number, step: number): number => 1 + (rating - 3) * step;

/** Multipliers a profile applies on top of the reference configs. */
export interface ProfileMultipliers {
  size: number;
  power: number;
  health: number;
  speed: number;
  agility: number;
  beam: number;
  /** Stagger resistance and footfall weight, from mass. */
  heft: number;
}

export function multipliersFor(p: TitanProfile): ProfileMultipliers {
  const r = p.ratings;
  return {
    size: p.height / REFERENCE.height,
    power: ratingMultiplier(r.power, 0.12),
    health: ratingMultiplier(r.armor, 0.15),
    speed: ratingMultiplier(r.speed, 0.1),
    agility: ratingMultiplier(r.agility, 0.12),
    beam: ratingMultiplier(r.beam, 0.12),
    heft: Math.min(1.4, Math.max(0.75, Math.sqrt(p.weight / REFERENCE.weight))),
  };
}

/** Body (height, hitbox) for a profile; `bulk` widens the capsule for broad builds. */
export function bodyFor(base: TitanBodyConfig, p: TitanProfile, bulk = 1): TitanBodyConfig {
  const k = p.height / REFERENCE.height;
  return {
    height: p.height,
    capsuleRadius: base.capsuleRadius * k * Math.sqrt(bulk),
    capsuleHalfHeight: base.capsuleHalfHeight * k,
    footSpread: base.footSpread * k * Math.sqrt(bulk),
  };
}

export function movementFor(base: TitanMovementConfig, p: TitanProfile): TitanMovementConfig {
  const m = multipliersFor(p);
  return {
    ...base,
    walkSpeed: base.walkSpeed * m.speed,
    sprintSpeed: base.sprintSpeed * m.speed,
    acceleration: base.acceleration * m.speed,
    sprintAcceleration: base.sprintAcceleration * m.speed,
    deceleration: base.deceleration * m.agility,
    turnRate: base.turnRate * m.agility,
    sprintTurnRate: base.sprintTurnRate * m.agility,
  };
}

/** Bigger titans take longer strides (slower cadence for the same speed: heavier). */
export function gaitFor(base: TitanGaitConfig, p: TitanProfile): TitanGaitConfig {
  const k = p.height / REFERENCE.height;
  return { ...base, walkStride: base.walkStride * k, sprintStride: base.sprintStride * k, pivotStride: base.pivotStride * k };
}

export function combatFor(base: CombatConfig, p: TitanProfile): CombatConfig {
  const m = multipliersFor(p);
  const move = (c: MoveConfig | undefined): MoveConfig | undefined =>
    c && { ...c, damage: c.damage * m.power, titanDamage: c.titanDamage * m.power, poiseDamage: c.poiseDamage * m.power * m.heft };
  return {
    ...base,
    claw: move(base.claw)!,
    tail: move(base.tail)!,
    stomp: move(base.stomp)!,
    lunge: move(base.lunge),
    volley: move(base.volley),
    pulse: move(base.pulse),
    beam: {
      ...base.beam,
      dps: base.beam.dps * m.beam,
      chargeTime: base.beam.chargeTime / m.beam,
      range: base.beam.range * (1 + (m.beam - 1) * 0.4),
    },
    health: {
      ...base.health,
      maxHealth: base.health.maxHealth * m.health,
      maxPoise: base.health.maxPoise * m.heft,
    },
  };
}
