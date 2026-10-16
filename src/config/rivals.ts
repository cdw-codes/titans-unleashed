import type { KaijuBodyConfig, KaijuGaitConfig, KaijuMovementConfig } from './kaiju';
import type { BeamConfig, CombatConfig, MoveConfig, RoarConfig } from './combat';

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
  /** Beam charge (0..1) it waits for before releasing. */
  readonly beamChargeTarget: number;
  readonly attacks: readonly AIAttack[];
}

export interface RivalConfig {
  readonly name: string;
  readonly title: string;
  readonly body: KaijuBodyConfig;
  readonly movement: KaijuMovementConfig;
  readonly gait: KaijuGaitConfig;
  readonly combat: CombatConfig;
  readonly ai: RivalAIConfig;
}

const move = (m: Partial<MoveConfig> & Pick<MoveConfig, 'windup' | 'active' | 'recovery' | 'damage' | 'radius' | 'kaijuDamage' | 'poiseDamage'>): MoveConfig => ({
  cooldown: 0.5,
  edgeFalloff: 1,
  arcDeg: 110,
  arcOffsetDeg: 0,
  moveMultiplier: 0,
  turnMultiplier: 0.3,
  trauma: 0.3,
  kick: 6,
  hitPause: 0.05,
  debrisPerHit: 3,
  ...m,
});

const noBeam: BeamConfig = {
  chargeTime: 1,
  minCharge: 1,
  minEnergyToCharge: Number.MAX_SAFE_INTEGER,
  energyPerSecond: 0,
  durationMin: 0,
  durationMax: 0,
  dpsMin: 0,
  dpsMax: 0,
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
  glowCharged: 1,
  kaijuDamageFraction: 0,
  poiseFraction: 0,
};

const roar: RoarConfig = { duration: 2, cooldown: 20, stunRadius: 0, stunSeconds: 0, trauma: 0.4 };

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
      claw: move({ windup: 0.14, active: 0.1, recovery: 0.28, cooldown: 0.2, damage: 150, radius: 55, arcDeg: 120, moveMultiplier: 0.5, kaijuDamage: 55, poiseDamage: 30 }),
      tail: move({ windup: 0.4, active: 0.3, recovery: 0.5, cooldown: 3, damage: 300, radius: 70, arcDeg: 200, arcOffsetDeg: 180, kaijuDamage: 90, poiseDamage: 60 }),
      stomp: move({ windup: 0.45, active: 0.08, recovery: 0.55, cooldown: 6, damage: 300, radius: 70, arcDeg: 360, edgeFalloff: 0.3, kaijuDamage: 100, poiseDamage: 70, trauma: 0.5 }),
      lunge: move({ windup: 0.45, active: 0.55, recovery: 0.7, cooldown: 5, damage: 350, radius: 62, arcDeg: 100, lungeSpeed: 55, hitAt: 'end', kaijuDamage: 200, poiseDamage: 120, trauma: 0.45 }),
      beam: noBeam,
      roar,
      health: { maxHealth: 1800, maxPoise: 140, poiseRegen: 35, staggerSeconds: 0.6, knockdownThreshold: 300, knockdownSeconds: 2.4, getUpInvulnerable: 1 },
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
      beamChargeTarget: 1,
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
      claw: move({ windup: 0.2, active: 0.12, recovery: 0.35, cooldown: 0.4, damage: 120, radius: 50, kaijuDamage: 40, poiseDamage: 25 }),
      tail: move({ windup: 0.5, active: 0.35, recovery: 0.6, cooldown: 4, damage: 280, radius: 95, arcDeg: 220, arcOffsetDeg: 180, kaijuDamage: 80, poiseDamage: 55 }),
      stomp: move({ windup: 0.5, active: 0.08, recovery: 0.6, cooldown: 5, damage: 280, radius: 75, arcDeg: 360, edgeFalloff: 0.3, kaijuDamage: 90, poiseDamage: 70, trauma: 0.5 }),
      volley: move({
        windup: 0.5, active: 1.2, recovery: 0.6, cooldown: 3.5, damage: 0, radius: 0, kaijuDamage: 0, poiseDamage: 0, turnMultiplier: 0.6,
        projectile: {
          count: 5, interval: 0.22, speed: 140, gravity: 25, lifetime: 6, spreadDeg: 6, size: 6,
          damage: 45, poiseDamage: 35, structureDamage: 120, blastRadius: 22, color: 0xc77dff,
        },
      }),
      beam: {
        chargeTime: 1.6, minCharge: 0.25, minEnergyToCharge: 0, energyPerSecond: 0,
        durationMin: 1.5, durationMax: 2.5, dpsMin: 500, dpsMax: 900, range: 520, impactRadius: 16, impactDpsFraction: 0.35,
        turnRate: 0.5, maxYawOffsetDeg: 30, minPitchDeg: -50, maxPitchDeg: 20, startup: 0.2, recovery: 0.8, cooldown: 7,
        traumaPerSecond: 0, glowCharged: 4, kaijuDamageFraction: 0.12, poiseFraction: 0.12,
      },
      roar,
      health: { maxHealth: 1400, maxPoise: 100, poiseRegen: 25, staggerSeconds: 0.7, knockdownThreshold: 260, knockdownSeconds: 2.8, getUpInvulnerable: 1 },
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
      beamChargeTarget: 0.85,
      attacks: [
        { move: 'volley', minRange: 150, maxRange: 480, weight: 4 },
        { move: 'beam', minRange: 120, maxRange: 450, weight: 2 },
        { move: 'claw', minRange: 0, maxRange: 58, weight: 3 },
        { move: 'stomp', minRange: 0, maxRange: 70, weight: 2 },
      ],
    },
  },
};
