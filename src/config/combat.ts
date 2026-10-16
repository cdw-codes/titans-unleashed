/**
 * Player combat moves and health. Distances in m (at the 100 m kaiju), times in s,
 * angles in degrees. Arc offset 0 = in front, 180 = behind.
 */
export interface MoveConfig {
  readonly windup: number;
  readonly active: number;
  readonly recovery: number;
  /** Extra wait after recovery before the move can be used again. */
  readonly cooldown: number;
  /** Damage to large structures (at the center for falloff moves). */
  readonly damage: number;
  /** Damage multiplier at the edge of the radius (1 = no falloff). */
  readonly edgeFalloff: number;
  readonly radius: number;
  readonly arcDeg: number;
  readonly arcOffsetDeg: number;
  /** Fraction of walk speed allowed during the move (0 = rooted). */
  readonly moveMultiplier: number;
  readonly turnMultiplier: number;
  readonly trauma: number;
  readonly kick: number;
  readonly hitPause: number;
  /** Debris pieces thrown per structure hit. */
  readonly debrisPerHit: number;
}

export interface BeamConfig {
  /** Seconds to reach full charge. */
  readonly chargeTime: number;
  /** Charge below this on release fizzles (no beam, no cost). */
  readonly minCharge: number;
  readonly minEnergyToCharge: number;
  readonly energyPerSecond: number;
  /** Fire duration at min and full charge. */
  readonly durationMin: number;
  readonly durationMax: number;
  /** Damage per second to the structure the beam touches, at min and full charge. */
  readonly dpsMin: number;
  readonly dpsMax: number;
  /** Must stay within CITY.physicsRadius: structures have no colliders beyond it. */
  readonly range: number;
  /** Radius (m) of the impact blast that crushes small things and hurts large ones. */
  readonly impactRadius: number;
  readonly impactDpsFraction: number;
  /** Body turn rate (rad/s) toward the aim while firing / charging. */
  readonly turnRate: number;
  /** Max horizontal angle (deg) between beam and body facing; the beam sweeps as the body turns. */
  readonly maxYawOffsetDeg: number;
  readonly minPitchDeg: number;
  readonly maxPitchDeg: number;
  readonly startup: number;
  readonly recovery: number;
  readonly cooldown: number;
  readonly traumaPerSecond: number;
  /** Plate glow intensity at full charge / while firing. */
  readonly glowCharged: number;
}

export interface RoarConfig {
  readonly duration: number;
  readonly cooldown: number;
  /** Enemies inside this radius get stunned (Milestone 5+). */
  readonly stunRadius: number;
  readonly stunSeconds: number;
  readonly trauma: number;
}

export interface HealthConfig {
  readonly maxHealth: number;
  /** Hits drain poise; at 0 the kaiju staggers. Regenerates per second. */
  readonly maxPoise: number;
  readonly poiseRegen: number;
  readonly staggerSeconds: number;
  /** A single hit at least this big knocks the kaiju down. */
  readonly knockdownThreshold: number;
  readonly knockdownSeconds: number;
  /** Invulnerability after getting back up. */
  readonly getUpInvulnerable: number;
}

export interface CombatConfig {
  readonly claw: MoveConfig;
  readonly tail: MoveConfig;
  readonly stomp: MoveConfig;
  readonly beam: BeamConfig;
  readonly roar: RoarConfig;
  readonly health: HealthConfig;
  /** A move pressed during another move's recovery is queued for this long. */
  readonly inputBuffer: number;
}

export const COMBAT: CombatConfig = {
  claw: {
    windup: 0.18,
    active: 0.12,
    recovery: 0.3,
    cooldown: 0.1,
    damage: 170,
    edgeFalloff: 1,
    radius: 48,
    arcDeg: 110,
    arcOffsetDeg: 0,
    moveMultiplier: 0.45,
    turnMultiplier: 0.6,
    trauma: 0.18,
    kick: 4,
    hitPause: 0.04,
    debrisPerHit: 3,
  },
  tail: {
    windup: 0.45,
    active: 0.35,
    recovery: 0.55,
    cooldown: 1.2,
    damage: 420,
    edgeFalloff: 0.8,
    radius: 90,
    arcDeg: 220,
    arcOffsetDeg: 180,
    moveMultiplier: 0,
    turnMultiplier: 0.3,
    trauma: 0.35,
    kick: 8,
    hitPause: 0.08,
    debrisPerHit: 5,
  },
  stomp: {
    windup: 0.5,
    active: 0.08,
    recovery: 0.6,
    cooldown: 4,
    damage: 380,
    edgeFalloff: 0.3,
    radius: 80,
    arcDeg: 360,
    arcOffsetDeg: 0,
    moveMultiplier: 0,
    turnMultiplier: 0,
    trauma: 0.65,
    kick: 26,
    hitPause: 0.1,
    debrisPerHit: 4,
  },
  beam: {
    chargeTime: 1.4,
    minCharge: 0.25,
    minEnergyToCharge: 8,
    energyPerSecond: 18,
    durationMin: 1.2,
    durationMax: 4,
    dpsMin: 500,
    dpsMax: 1100,
    range: 600,
    impactRadius: 18,
    impactDpsFraction: 0.35,
    turnRate: 0.7,
    maxYawOffsetDeg: 35,
    minPitchDeg: -60,
    maxPitchDeg: 30,
    startup: 0.15,
    recovery: 0.6,
    cooldown: 1.5,
    traumaPerSecond: 0.9,
    glowCharged: 4,
  },
  roar: {
    duration: 2.2,
    cooldown: 10,
    stunRadius: 400,
    stunSeconds: 2.5,
    trauma: 0.55,
  },
  health: {
    maxHealth: 1000,
    maxPoise: 100,
    poiseRegen: 30,
    staggerSeconds: 0.6,
    knockdownThreshold: 250,
    knockdownSeconds: 2.6,
    getUpInvulnerable: 1,
  },
  inputBuffer: 0.3,
};
