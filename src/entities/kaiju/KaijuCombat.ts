import { COMBAT, type MoveConfig } from '../../config/combat';
import { clamp, wrapAngle } from '../../core/math';
import { beamShot, clampBeamAim, Cooldowns, moveLength, movePhase, type MovePhase } from '../../systems/combat/rules';
import { Health, type HitReaction } from '../../systems/combat/Health';
import type { KaijuState } from './locomotion';

export type MoveId = 'claw' | 'tail' | 'stomp';
export type CooldownId = MoveId | 'beam' | 'roar';

/** Buttons for this tick (presses are edge-triggered; beamHeld is level). */
export interface CombatInput {
  claw: boolean;
  tail: boolean;
  stomp: boolean;
  roar: boolean;
  beamHeld: boolean;
  /** World point the beam should aim at (crosshair), or null. */
  aim: { x: number; y: number; z: number } | null;
}

export interface EnergyPool {
  readonly energy: number;
  spend(amount: number): boolean;
}

/** Attacks produced this tick, resolved against the world by CombatSystem. */
export type AttackEvent =
  | { type: 'area'; move: MoveId; cfg: MoveConfig; x: number; z: number; yaw: number }
  | { type: 'roar'; x: number; z: number }
  | { type: 'beam'; ox: number; oy: number; oz: number; dx: number; dy: number; dz: number; damage: number };

/** What the body may do this tick. */
export interface MovementAllowance {
  moveMultiplier: number;
  turnMultiplier: number;
  /** Turn toward this yaw (beam aiming) at `faceRate`. */
  faceYaw: number | null;
  faceRate: number;
}

/** Animation info for the model. */
export interface CombatAction {
  kind: KaijuState;
  /** Seconds since the action started. */
  t: number;
  /** Which arm swipes (claw alternates). */
  side: 1 | -1;
  /** Timed move behind an 'attack' state. */
  move: MoveId | null;
  /** Beam charge 0..1 (charging) or 1 (firing). */
  charge: number;
}

interface Body {
  readonly position: { x: number; y: number; z: number };
  readonly yaw: number;
  readonly mouthHeight: number;
  readonly mouthForward: number;
  setState(s: KaijuState): void;
  readonly state: KaijuState;
}

const LOCOMOTION: KaijuState[] = ['idle', 'walk', 'sprint'];
const FREE: MovementAllowance = { moveMultiplier: 1, turnMultiplier: 1, faceYaw: null, faceRate: 0 };

/**
 * Combat state for one kaiju (player or rival): move timelines, beam charge and
 * fire, roar, hit reactions. Fixed tick. Produces AttackEvents and tells the
 * body how much it may move.
 */
export class KaijuCombat {
  readonly health = new Health(COMBAT.health);
  readonly cooldowns = new Cooldowns<CooldownId>();
  readonly attacks: AttackEvent[] = [];
  readonly action: CombatAction = { kind: 'idle', t: 0, side: 1, charge: 0, move: null };
  /** Last resolved beam endpoint (set by CombatSystem), for visuals. */
  readonly beamEnd = { x: 0, y: 0, z: 0, hit: false };
  readonly beamDir = { x: 0, y: 0, z: 1 };

  private move: MoveId | null = null;
  private emitted = false;
  private queued: { move: MoveId | 'roar'; age: number } | null = null;
  private beamCharge = 0;
  private beamDps = 0;
  private beamDuration = 0;
  private clawSide: 1 | -1 = 1;

  constructor(
    private readonly body: Body,
    private readonly energy: EnergyPool,
  ) {}

  get busy(): boolean {
    return !LOCOMOTION.includes(this.body.state);
  }

  get charge(): number {
    return this.beamCharge;
  }

  /** Total time a cooldown blocks, for HUD fill. */
  cooldownTotal(id: CooldownId): number {
    const c = COMBAT;
    switch (id) {
      case 'claw': return c.claw.cooldown;
      case 'tail': return c.tail.cooldown;
      case 'stomp': return c.stomp.cooldown;
      case 'beam': return c.beam.cooldown;
      case 'roar': return c.roar.cooldown;
    }
  }

  update(dt: number, input: CombatInput): MovementAllowance {
    this.attacks.length = 0;
    this.cooldowns.tick(dt);
    this.health.update(dt);
    this.action.t += dt;
    const state = this.body.state;

    if (state === 'defeated') return this.rooted();
    if (state === 'stagger') {
      if (this.action.t >= COMBAT.health.staggerSeconds) this.toIdle();
      return this.rooted();
    }
    if (state === 'knockdown') {
      if (this.action.t >= COMBAT.health.knockdownSeconds) {
        this.health.makeInvulnerable(COMBAT.health.getUpInvulnerable);
        this.toIdle();
      }
      return this.rooted();
    }

    this.bufferInput(input, dt);

    switch (state) {
      case 'attack':
      case 'stomp':
        return this.updateMove();
      case 'roar':
        return this.updateRoar();
      case 'beamCharge':
        return this.updateCharge(dt, input);
      case 'beamFire':
        return this.updateFire(dt, input);
      default:
        this.tryStart(input);
        return this.busy ? this.rooted() : FREE;
    }
  }

  /** Apply a hit to this kaiju. Returns the reaction (already applied to state). */
  takeHit(damage: number): HitReaction {
    const r = this.health.hit(damage);
    if (r === 'none') return r;
    this.move = null;
    this.queued = null;
    this.beamCharge = 0;
    this.enter(r === 'defeated' ? 'defeated' : r);
    return r;
  }

  respawn(): void {
    this.health.reset();
    this.health.makeInvulnerable(COMBAT.health.getUpInvulnerable);
    this.toIdle();
  }

  // ------------------------------------------------------------- states

  private bufferInput(input: CombatInput, dt: number): void {
    const pressed: MoveId | 'roar' | null = input.stomp ? 'stomp' : input.tail ? 'tail' : input.claw ? 'claw' : input.roar ? 'roar' : null;
    if (pressed) this.queued = { move: pressed, age: 0 };
    else if (this.queued) {
      this.queued.age += dt;
      if (this.queued.age > COMBAT.inputBuffer) this.queued = null;
    }
  }

  private tryStart(input: CombatInput): void {
    const q = this.queued?.move;
    if (q === 'roar' && this.cooldowns.isReady('roar')) {
      this.queued = null;
      this.enter('roar');
      return;
    }
    if (q && q !== 'roar' && this.cooldowns.isReady(q)) {
      this.queued = null;
      this.move = q;
      this.emitted = false;
      if (q === 'claw') this.clawSide = this.clawSide === 1 ? -1 : 1;
      this.action.side = this.clawSide;
      this.enter(q === 'stomp' ? 'stomp' : 'attack');
      this.action.move = q;
      return;
    }
    if (input.beamHeld && this.cooldowns.isReady('beam') && this.energy.energy >= COMBAT.beam.minEnergyToCharge) {
      this.beamCharge = 0;
      this.enter('beamCharge');
    }
  }

  private updateMove(): MovementAllowance {
    const cfg = COMBAT[this.move!];
    const phase: MovePhase = movePhase(this.action.t, cfg);
    if (phase === 'active' && !this.emitted) {
      this.emitted = true;
      const p = this.body.position;
      this.attacks.push({ type: 'area', move: this.move!, cfg, x: p.x, z: p.z, yaw: this.body.yaw });
    }
    if (phase === 'done') {
      this.cooldowns.start(this.move!, cfg.cooldown);
      this.move = null;
      this.toIdle();
      return FREE;
    }
    // Recovery can be cancelled into a buffered claw (combo), nothing else.
    if (phase === 'recovery' && this.move === 'claw' && this.queued?.move === 'claw' && this.cooldowns.isReady('claw')) {
      this.cooldowns.start('claw', cfg.cooldown);
      this.toIdle();
      return FREE;
    }
    return { moveMultiplier: cfg.moveMultiplier, turnMultiplier: cfg.turnMultiplier, faceYaw: null, faceRate: 0 };
  }

  private updateRoar(): MovementAllowance {
    const r = COMBAT.roar;
    if (!this.emitted && this.action.t >= 0.35) {
      this.emitted = true;
      const p = this.body.position;
      this.attacks.push({ type: 'roar', x: p.x, z: p.z });
    }
    if (this.action.t >= r.duration) {
      this.cooldowns.start('roar', r.cooldown);
      this.toIdle();
    }
    return this.rooted();
  }

  private updateCharge(dt: number, input: CombatInput): MovementAllowance {
    const b = COMBAT.beam;
    this.beamCharge = clamp(this.beamCharge + dt / b.chargeTime, 0, 1);
    this.action.charge = this.beamCharge;
    if (!input.beamHeld) {
      const shot = beamShot(this.beamCharge, b);
      if (!shot) {
        this.beamCharge = 0;
        this.toIdle();
        return FREE;
      }
      this.beamDps = shot.dps;
      this.beamDuration = shot.duration;
      this.enter('beamFire');
      this.action.charge = 1;
    }
    return this.aimAllowance(input);
  }

  private updateFire(dt: number, input: CombatInput): MovementAllowance {
    const b = COMBAT.beam;
    const t = this.action.t;
    const firing = t >= b.startup && t < b.startup + this.beamDuration;
    if (firing) {
      if (!this.energy.spend(b.energyPerSecond * dt)) {
        // Out of energy: cut the beam short.
        this.action.t = b.startup + this.beamDuration;
      } else {
        this.emitBeam(input, this.beamDps * dt);
      }
    }
    if (t >= b.startup + this.beamDuration + b.recovery) {
      this.cooldowns.start('beam', b.cooldown);
      this.beamCharge = 0;
      this.toIdle();
      return FREE;
    }
    this.action.charge = firing ? 1 : Math.max(0, 1 - (t - b.startup - this.beamDuration) / b.recovery);
    return this.aimAllowance(input);
  }

  /** Beam firing right now (after startup, before recovery)? */
  get isBeamFiring(): boolean {
    const b = COMBAT.beam;
    return this.body.state === 'beamFire' && this.action.t >= b.startup && this.action.t < b.startup + this.beamDuration;
  }

  private emitBeam(input: CombatInput, damage: number): void {
    const p = this.body.position;
    const yaw = this.body.yaw;
    const ox = p.x + Math.sin(yaw) * this.body.mouthForward;
    const oy = p.y + this.body.mouthHeight;
    const oz = p.z + Math.cos(yaw) * this.body.mouthForward;
    let aimYaw = yaw;
    let aimPitch = -0.25;
    if (input.aim) {
      const dx = input.aim.x - ox;
      const dy = input.aim.y - oy;
      const dz = input.aim.z - oz;
      aimYaw = Math.atan2(dx, dz);
      aimPitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
    const a = clampBeamAim(aimYaw, aimPitch, yaw, COMBAT.beam);
    const cp = Math.cos(a.pitch);
    this.beamDir.x = Math.sin(a.yaw) * cp;
    this.beamDir.y = Math.sin(a.pitch);
    this.beamDir.z = Math.cos(a.yaw) * cp;
    this.attacks.push({ type: 'beam', ox, oy, oz, dx: this.beamDir.x, dy: this.beamDir.y, dz: this.beamDir.z, damage });
  }

  private aimAllowance(input: CombatInput): MovementAllowance {
    let faceYaw: number | null = null;
    if (input.aim) {
      const p = this.body.position;
      faceYaw = Math.atan2(input.aim.x - p.x, input.aim.z - p.z);
      // Don't spin when the aim point is basically under the kaiju.
      if (Math.hypot(input.aim.x - p.x, input.aim.z - p.z) < 10) faceYaw = null;
      else faceYaw = wrapAngle(faceYaw);
    }
    return { moveMultiplier: 0, turnMultiplier: 0, faceYaw, faceRate: COMBAT.beam.turnRate };
  }

  private rooted(): MovementAllowance {
    return { moveMultiplier: 0, turnMultiplier: 0, faceYaw: null, faceRate: 0 };
  }

  private enter(state: KaijuState): void {
    this.action.kind = state;
    this.action.t = 0;
    this.action.move = null;
    if (state !== 'beamCharge' && state !== 'beamFire') this.action.charge = 0;
    this.emitted = false;
    this.body.setState(state);
  }

  private toIdle(): void {
    this.enter('idle');
  }

  /** Seconds the current timed move lasts (for animation normalisation). */
  get moveDuration(): number {
    return this.move ? moveLength(COMBAT[this.move]) : 0;
  }

  get currentMove(): MoveId | null {
    return this.move;
  }
}
