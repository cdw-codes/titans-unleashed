import type { TitanBodyConfig, TitanGaitConfig, TitanMovementConfig } from './titan';
import type { BeamConfig, CombatConfig } from './combat';

export type RivalId = 'thornmaw' | 'vesperion';

export interface AIAttack {
  move: 'claw' | 'tail' | 'stomp' | 'lunge' | 'volley' | 'beam';
  minRange: number;
  maxRange: number;
  weight: number;
}

/** Readable AI personality: tweak these to change how a rival fights. */
export interface RivalAIConfig {
  /** 0..1 chance to attack when an attack is available at a decision point. */
  readonly aggression: number;
  /** Seconds between decisions (± 20% jitter). Lower = sharper reactions. */
  readonly reactionDelay: number;
  /** Distance (m) it tries to hold from the target, ± tolerance. */
  readonly preferredRange: number;
  readonly rangeTolerance: number;
  /** Sprint when farther than this (m). */
  readonly sprintRange: number;
  /** Back off (facing the target) when closer than this (m). 0 = never. */
  readonly retreatRange: number;
  /** Max facing error (deg) before it commits to an attack. */
  readonly attackFacingDeg: number;
  /** How long it holds the beam once it fires (s). */
  readonly beamFireSeconds: number;
  readonly attacks: readonly AIAttack[];
}

export interface RivalConfig {
  readonly name: string;
  readonly title: string;
  readonly body: TitanBodyConfig;
  readonly movement: TitanMovementConfig;
  readonly gait: TitanGaitConfig;
  readonly combat: CombatConfig;
  readonly ai: RivalAIConfig;
}

const noBeam: BeamConfig = {
  chargeTime: 1,
  minEnergyToCharge: Number.MAX_SAFE_INTEGER,
  energyPerSecond: 0,
  maxDuration: 0,
  dps: 0,
  range: 0,
  impactRadius: 0,
  impactDpsFraction: 0,
  turnRate: 0,
  maxYawOffsetDeg: 0,
  minPitchDeg: 0,
  maxPitchDeg: 0,
  startup: 0,
  recovery: 0,
  cooldown: 0,
  traumaPerSecond: 0,
  cancelRecovery: 0,
  glowCharged: 1,
  titanDamageFraction: 0,
  poiseFraction: 0,
};


export const RIVALS: Readonly<Record<RivalId, RivalConfig>> = {
  thornmaw: {
    name: 'THORNMAW',
    title: 'The Horned Brawler',
    body: { height: 90, capsuleRadius: 15, capsuleHalfHeight: 26, footSpread: 10 },
    movement: {
      walkSpeed: 16, sprintSpeed: 30, acceleration: 12, sprintAcceleration: 6, deceleration: 10,
      turnRate: 1.9, sprintTurnRate: 1.1, turnSlowdown: 0.7, idleSpeed: 0.4, strafeSpeedFactor: 0.75, backpedalSpeedFactor: 0.6,
    },
    gait: { walkStride: 44, sprintStride: 60, pivotStride: 16, settleRate: 0.4 },
    combat: {
      claw: {
        windup: 0.14,
        active: 0.1,
        recovery: 0.28,
        cooldown: 0.2,
        damage: 150,
        edgeFalloff: 1,
        radius: 55,
        arcDeg: 120,
        arcOffsetDeg: 0,
        moveMultiplier: 0.5,
        turnMultiplier: 0.3,
        trauma: 0.3,
        kick: 6,
        hitPause: 0.05,
        debrisPerHit: 3,
        titanDamage: 55,
        poiseDamage: 30,
      },
      tail: {
        windup: 0.4,
        active: 0.3,
        recovery: 0.5,
        cooldown: 3,
        damage: 300,
        edgeFalloff: 1,
        radius: 70,
        arcDeg: 200,
        arcOffsetDeg: 180,
        moveMultiplier: 0,
        turnMultiplier: 0.3,
        trauma: 0.3,
        kick: 6,
        hitPause: 0.05,
        debrisPerHit: 3,
        titanDamage: 90,
        poiseDamage: 60,
      },
      stomp: {
        windup: 0.45,
        active: 0.08,
        recovery: 0.55,
        cooldown: 6,
        damage: 300,
        edgeFalloff: 0.3,
        radius: 70,
        arcDeg: 360,
        arcOffsetDeg: 0,
        moveMultiplier: 0,
        turnMultiplier: 0.3,
        trauma: 0.5,
        kick: 6,
        hitPause: 0.05,
        debrisPerHit: 3,
        titanDamage: 100,
        poiseDamage: 70,
      },
      lunge: {
        windup: 0.45,
        active: 0.55,
        recovery: 0.7,
        cooldown: 5,
        damage: 350,
        edgeFalloff: 1,
        radius: 62,
        arcDeg: 100,
        arcOffsetDeg: 0,
        moveMultiplier: 0,
        turnMultiplier: 0.3,
        trauma: 0.45,
        kick: 6,
        hitPause: 0.05,
        debrisPerHit: 3,
        titanDamage: 200,
        poiseDamage: 120,
        lungeSpeed: 55,
        hitAt: 'end',
      },
      beam: noBeam,
      roar: { duration: 2, cooldown: 20, stunRadius: 0, stunSeconds: 0, trauma: 0.4 },
      health: { maxHealth: 1800, maxPoise: 140, poiseRegen: 20, staggerSeconds: 0.6, knockdownThreshold: 300, knockdownSeconds: 2.4, getUpInvulnerable: 1 },
      inputBuffer: 0.1,
    },
    ai: {
      aggression: 0.8,
      reactionDelay: 0.35,
      preferredRange: 45,
      rangeTolerance: 15,
      sprintRange: 180,
      retreatRange: 0,
      attackFacingDeg: 30,
      beamFireSeconds: 0,
      attacks: [
        { move: 'claw', minRange: 0, maxRange: 62, weight: 5 },
        { move: 'stomp', minRange: 0, maxRange: 65, weight: 1.5 },
        { move: 'tail', minRange: 0, maxRange: 70, weight: 1 },
        { move: 'lunge', minRange: 90, maxRange: 260, weight: 3 },
      ],
    },
  },
  vesperion: {
    name: 'VESPERION',
    title: 'The Crested Siege-Beast',
    body: { height: 105, capsuleRadius: 14, capsuleHalfHeight: 33, footSpread: 10 },
    movement: {
      walkSpeed: 11, sprintSpeed: 20, acceleration: 6, sprintAcceleration: 3, deceleration: 6,
      turnRate: 1.2, sprintTurnRate: 0.7, turnSlowdown: 0.8, idleSpeed: 0.4, strafeSpeedFactor: 0.7, backpedalSpeedFactor: 0.6,
    },
    gait: { walkStride: 42, sprintStride: 58, pivotStride: 16, settleRate: 0.35 },
    combat: {
      claw: {
        windup: 0.2,
        active: 0.12,
        recovery: 0.35,
        cooldown: 0.4,
        damage: 120,
        edgeFalloff: 1,
        radius: 50,
        arcDeg: 110,
        arcOffsetDeg: 0,
        moveMultiplier: 0,
        turnMultiplier: 0.3,
        trauma: 0.3,
        kick: 6,
        hitPause: 0.05,
        debrisPerHit: 3,
        titanDamage: 40,
        poiseDamage: 25,
      },
      tail: {
        windup: 0.5,
        active: 0.35,
        recovery: 0.6,
        cooldown: 4,
        damage: 280,
        edgeFalloff: 1,
        radius: 95,
        arcDeg: 220,
        arcOffsetDeg: 180,
        moveMultiplier: 0,
        turnMultiplier: 0.3,
        trauma: 0.3,
        kick: 6,
        hitPause: 0.05,
        debrisPerHit: 3,
        titanDamage: 80,
        poiseDamage: 55,
      },
      stomp: {
        windup: 0.5,
        active: 0.08,
        recovery: 0.6,
        cooldown: 5,
        damage: 280,
        edgeFalloff: 0.3,
        radius: 75,
        arcDeg: 360,
        arcOffsetDeg: 0,
        moveMultiplier: 0,
        turnMultiplier: 0.3,
        trauma: 0.5,
        kick: 6,
        hitPause: 0.05,
        debrisPerHit: 3,
        titanDamage: 90,
        poiseDamage: 70,
      },
      volley: {
        windup: 0.5,
        active: 1.2,
        recovery: 0.6,
        cooldown: 3.5,
        damage: 0,
        edgeFalloff: 1,
        radius: 0,
        arcDeg: 0,
        arcOffsetDeg: 0,
        moveMultiplier: 0,
        turnMultiplier: 0.6,
        trauma: 0,
        kick: 0,
        hitPause: 0,
        debrisPerHit: 0,
        titanDamage: 0,
        poiseDamage: 0,
        projectile: {
          count: 5, interval: 0.22, speed: 140, gravity: 25, lifetime: 6, spreadDeg: 6, size: 6,
          damage: 30, poiseDamage: 30, structureDamage: 120, blastRadius: 22, color: 0xc77dff,
        },
      },
      beam: {
        chargeTime: 1.6, minEnergyToCharge: 0, energyPerSecond: 0,
        maxDuration: 3, dps: 800, range: 520, impactRadius: 16, impactDpsFraction: 0.35,
        turnRate: 0.5, maxYawOffsetDeg: 30, minPitchDeg: -50, maxPitchDeg: 20, startup: 0.2, recovery: 0.8, cooldown: 7,
        traumaPerSecond: 0, cancelRecovery: 0.3, glowCharged: 4, titanDamageFraction: 0.08, poiseFraction: 0.12,
      },
      roar: { duration: 2, cooldown: 20, stunRadius: 0, stunSeconds: 0, trauma: 0.4 },
      health: { maxHealth: 1400, maxPoise: 100, poiseRegen: 18, staggerSeconds: 0.7, knockdownThreshold: 260, knockdownSeconds: 2.8, getUpInvulnerable: 1 },
      inputBuffer: 0.1,
    },
    ai: {
      aggression: 0.7,
      reactionDelay: 0.5,
      preferredRange: 280,
      rangeTolerance: 80,
      sprintRange: 600,
      retreatRange: 140,
      attackFacingDeg: 20,
      beamFireSeconds: 2.2,
      attacks: [
        { move: 'volley', minRange: 150, maxRange: 480, weight: 4 },
        { move: 'beam', minRange: 120, maxRange: 450, weight: 2 },
        { move: 'claw', minRange: 0, maxRange: 58, weight: 3 },
        { move: 'stomp', minRange: 0, maxRange: 70, weight: 2 },
      ],
    },
  },
};
