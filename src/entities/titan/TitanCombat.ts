import type { CombatConfig, MoveConfig } from '../../config/combat';
import { clamp, wrapAngle } from '../../core/math';
import { clampBeamAim, Cooldowns, moveLength, movePhase, type MovePhase } from '../../systems/combat/rules';
import { Health, type HitReaction } from '../../systems/combat/Health';
import type { TitanState } from './locomotion';
import { baseModifiers, type TitanModifiers } from '../../systems/progression/Upgrades';

export type MoveId = 'claw' | 'tail' | 'stomp' | 'lunge' | 'volley' | 'pulse';
export type CooldownId = MoveId | 'beam' | 'roar';

/** Buttons for this tick (presses are edge-triggered; beamHeld is level). */
export interface CombatInput {
  claw: boolean;
  tail: boolean;
  stomp: boolean;
  roar: boolean;
  beamHeld: boolean;
  /** Rival-only moves. */
  lunge?: boolean;
  volley?: boolean;
  /** Unlockable player move. */
  pulse?: boolean;
  /** World point to aim the beam / projectiles at (crosshair or AI target), or null. */
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
  | { type: 'beam'; ox: number; oy: number; oz: number; dx: number; dy: number; dz: number; damage: number }
  | { type: 'projectile'; cfg: MoveConfig; ox: number; oy: number; oz: number; tx: number; ty: number; tz: number };

/** What the body may do this tick. */
export interface MovementAllowance {
  moveMultiplier: number;
  turnMultiplier: number;
  /** Turn toward this yaw (beam aiming) at `faceRate`. */
  faceYaw: number | null;
  faceRate: number;
  /** Forced forward dash speed (lunge), or 0. */
  lungeSpeed: number;
}

/** Animation info for the model. */
export interface CombatAction {
  kind: TitanState;
  /** Seconds since the action started. */
  t: number;
  /** Which arm swipes (claw alternates). */
  side: 1 | -1;
  /** Beam charge 0..1 (charging) or 1 (firing). */
  charge: number;
  /** Timed move behind an 'attack' state. */
  move: MoveId | null;
  /** Length of the current stagger (stuns last longer than hit staggers). */
  staggerSeconds: number;
}

interface Body {
  readonly position: { x: number; y: number; z: number };
  readonly yaw: number;
  readonly mouthHeight: number;
  readonly mouthForward: number;
  setState(s: TitanState): void;
  readonly state: TitanState;
}

const LOCOMOTION: TitanState[] = ['idle', 'walk', 'sprint'];
const FREE: MovementAllowance = { moveMultiplier: 1, turnMultiplier: 1, faceYaw: null, faceRate: 0, lungeSpeed: 0 };
const ROOTED: MovementAllowance = { moveMultiplier: 0, turnMultiplier: 0, faceYaw: null, faceRate: 0, lungeSpeed: 0 };
const PRIORITY: (MoveId | 'roar')[] = ['pulse', 'stomp', 'tail', 'lunge', 'volley', 'claw', 'roar'];

/**
 * Combat state for one titan (player or rival): move timelines, beam charge and
 * fire, roar, hit reactions. Fixed tick. Produces AttackEvents and tells the
 * body how much it may move. Each titan has its own CombatConfig.
 */
export class TitanCombat {
  readonly health: Health;
  readonly cooldowns = new Cooldowns<CooldownId>();
  readonly attacks: AttackEvent[] = [];
  readonly action: CombatAction = { kind: 'idle', t: 0, side: 1, charge: 0, move: null, staggerSeconds: 0 };
  /** Last resolved beam endpoint (set by CombatSystem), for visuals. */
  readonly beamEnd = { x: 0, y: 0, z: 0, hit: false };
  readonly beamDir = { x: 0, y: 0, z: 1 };
  /** Upgrade multipliers (player); rivals keep the base. */
  mods: TitanModifiers = baseModifiers();

  private move: MoveId | null = null;
  private emitted = 0;
  private queued: { move: MoveId | 'roar'; age: number } | null = null;
  private beamCharge = 0;
  /** Time (in beamFire) the beam stopped, or +Infinity while it runs. */
  private fireEnd = Number.POSITIVE_INFINITY;
  private stopRecovery = 0;
  private clawSide: 1 | -1 = 1;
  private aim: CombatInput['aim'] = null;

  constructor(
    private readonly body: Body,
    private readonly energy: EnergyPool,
    readonly cfg: CombatConfig,
  ) {
    this.health = new Health(cfg.health);
  }

  get busy(): boolean {
    return !LOCOMOTION.includes(this.body.state);
  }

  get charge(): number {
    return this.beamCharge;
  }

  get currentMove(): MoveId | null {
    return this.move;
  }

  /** Seconds the current timed move lasts (for animation normalisation). */
  get moveDuration(): number {
    return this.move ? moveLength(this.moveCfg(this.move)) : 0;
  }

  hasMove(id: MoveId): boolean {
    if (id === 'pulse') return this.cfg.pulse !== undefined && this.mods.pulse;
    return this.cfg[id] !== undefined;
  }

  /** Total time a cooldown blocks, for HUD fill. */
  cooldownTotal(id: CooldownId): number {
    if (id === 'beam') return this.cfg.beam.cooldown;
    if (id === 'roar') return this.cfg.roar.cooldown;
    return this.cfg[id]?.cooldown ?? 0;
  }

  /** Can this move start right now (idle-ish, off cooldown)? Used by AI. */
  canStart(id: CooldownId): boolean {
    if (this.busy) return false;
    if (id !== 'beam' && id !== 'roar' && !this.hasMove(id)) return false;
    if (id !== 'beam' && id !== 'roar' && this.energy.energy < (this.moveCfg(id).energyCost ?? 0)) return false;
    if (id === 'beam' && this.energy.energy < this.cfg.beam.minEnergyToCharge) return false;
    return this.cooldowns.isReady(id);
  }

  update(dt: number, input: CombatInput): MovementAllowance {
    this.attacks.length = 0;
    this.cooldowns.tick(dt);
    this.health.update(dt);
    this.action.t += dt;
    this.aim = input.aim;
    const h = this.cfg.health;
    const state = this.body.state;

    if (state === 'defeated') return ROOTED;
    if (state === 'stagger') {
      if (this.action.t >= this.action.staggerSeconds) this.toIdle();
      return ROOTED;
    }
    if (state === 'knockdown') {
      if (this.action.t >= h.knockdownSeconds) {
        this.health.makeInvulnerable(h.getUpInvulnerable);
        this.toIdle();
      }
      return ROOTED;
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
        return this.busy ? ROOTED : FREE;
    }
  }

  /** Apply a hit to this titan. Returns the reaction (already applied to state). */
  takeHit(damage: number, poiseDamage = damage): HitReaction {
    const r = this.health.hit(damage, poiseDamage);
    if (r === 'none') return r;
    this.interrupt();
    if (r === 'stagger') this.action.staggerSeconds = this.cfg.health.staggerSeconds;
    this.enter(r);
    if (r === 'stagger') this.action.staggerSeconds = this.cfg.health.staggerSeconds;
    return r;
  }

  /** Roar stun: a long stagger that ignores poise. No effect while down or invulnerable. */
  stun(seconds: number): boolean {
    const s = this.body.state;
    if (s === 'defeated' || s === 'knockdown' || this.health.isInvulnerable) return false;
    this.interrupt();
    this.enter('stagger');
    this.action.staggerSeconds = seconds;
    return true;
  }

  /** A network player's titan: its action comes from the wire, not from input. */
  private remoteFiring: boolean | null = null;

  applyRemote(kind: TitanState, t: number, side: 1 | -1, charge: number, move: MoveId | null, firing: boolean, health: number): void {
    const a = this.action;
    a.kind = kind;
    a.t = t;
    a.side = side;
    a.charge = charge;
    a.move = move;
    this.move = move;
    this.beamCharge = charge;
    this.remoteFiring = firing;
    this.health.health = health * this.health.max;
  }

  respawn(): void {
    this.health.reset();
    this.health.makeInvulnerable(this.cfg.health.respawnInvulnerable ?? this.cfg.health.getUpInvulnerable);
    this.toIdle();
  }

  /** Beam firing right now (after startup, still held)? */
  get isBeamFiring(): boolean {
    if (this.remoteFiring !== null) return this.remoteFiring;
    return this.body.state === 'beamFire' && this.fireEnd === Number.POSITIVE_INFINITY && this.action.t >= this.cfg.beam.startup;
  }

  // ------------------------------------------------------------- states

  private moveCfg(id: MoveId): MoveConfig {
    const m = this.cfg[id];
    if (!m) throw new Error(`Move ${id} not configured`);
    return m;
  }

  private interrupt(): void {
    this.move = null;
    this.queued = null;
    this.beamCharge = 0;
  }

  private bufferInput(input: CombatInput, dt: number): void {
    const pressed = PRIORITY.find((m) => input[m] === true) ?? null;
    if (pressed) this.queued = { move: pressed, age: 0 };
    else if (this.queued) {
      this.queued.age += dt;
      if (this.queued.age > this.cfg.inputBuffer) this.queued = null;
    }
  }

  private tryStart(input: CombatInput): void {
    const q = this.queued?.move;
    if (q === 'roar' && this.cooldowns.isReady('roar')) {
      this.queued = null;
      this.enter('roar');
      return;
    }
    if (q && q !== 'roar' && this.hasMove(q) && this.cooldowns.isReady(q)) {
      const cost = this.moveCfg(q).energyCost ?? 0;
      if (cost > 0 && !this.energy.spend(cost)) {
        this.queued = null;
        return;
      }
      this.queued = null;
      this.move = q;
      if (q === 'claw') this.clawSide = this.clawSide === 1 ? -1 : 1;
      this.enter(q === 'stomp' ? 'stomp' : 'attack');
      this.action.move = q;
      this.action.side = this.clawSide;
      return;
    }
    if (input.beamHeld && this.cooldowns.isReady('beam') && this.energy.energy >= this.cfg.beam.minEnergyToCharge) {
      this.beamCharge = 0;
      this.enter('beamCharge');
    }
  }

  private updateMove(): MovementAllowance {
    const id = this.move!;
    const cfg = this.moveCfg(id);
    const phase: MovePhase = movePhase(this.action.t, cfg);
    const p = this.body.position;

    if (cfg.projectile) {
      // Volley: one shot per interval through the active window.
      const pr = cfg.projectile;
      const sinceActive = this.action.t - cfg.windup;
      while (phase !== 'windup' && this.emitted < pr.count && sinceActive >= this.emitted * pr.interval) {
        this.emitted++;
        this.emitProjectile(cfg);
      }
    } else if (!this.emitted && (cfg.hitAt === 'end' ? phase === 'recovery' || phase === 'done' : phase === 'active' || phase === 'recovery' || phase === 'done')) {
      this.emitted = 1;
      this.attacks.push({ type: 'area', move: id, cfg, x: p.x, z: p.z, yaw: this.body.yaw });
    }

    if (phase === 'done') {
      this.cooldowns.start(id, cfg.cooldown);
      this.move = null;
      this.toIdle();
      return FREE;
    }
    // Recovery can be cancelled into a buffered claw (combo), nothing else.
    if (phase === 'recovery' && id === 'claw' && this.queued?.move === 'claw' && this.cooldowns.isReady('claw')) {
      this.cooldowns.start('claw', cfg.cooldown);
      this.toIdle();
      return FREE;
    }
    return {
      moveMultiplier: cfg.moveMultiplier,
      turnMultiplier: cfg.turnMultiplier,
      faceYaw: null,
      faceRate: 0,
      lungeSpeed: phase === 'active' ? (cfg.lungeSpeed ?? 0) : 0,
    };
  }

  private emitProjectile(cfg: MoveConfig): void {
    const p = this.body.position;
    const yaw = this.body.yaw;
    const ox = p.x + Math.sin(yaw) * this.body.mouthForward;
    const oy = p.y + this.body.mouthHeight;
    const oz = p.z + Math.cos(yaw) * this.body.mouthForward;
    const t = this.aim ?? { x: ox + Math.sin(yaw) * 300, y: 0, z: oz + Math.cos(yaw) * 300 };
    this.attacks.push({ type: 'projectile', cfg, ox, oy, oz, tx: t.x, ty: t.y, tz: t.z });
  }

  private updateRoar(): MovementAllowance {
    const r = this.cfg.roar;
    if (!this.emitted && this.action.t >= 0.35) {
      this.emitted = 1;
      const p = this.body.position;
      this.attacks.push({ type: 'roar', x: p.x, z: p.z });
    }
    if (this.action.t >= r.duration) {
      this.cooldowns.start('roar', r.cooldown);
      this.toIdle();
    }
    return ROOTED;
  }

  private updateCharge(dt: number, input: CombatInput): MovementAllowance {
    const b = this.cfg.beam;
    if (!input.beamHeld) {
      // Let go before it fired: cancel, no cost, no cooldown.
      this.beamCharge = 0;
      this.toIdle();
      return FREE;
    }
    this.beamCharge = clamp(this.beamCharge + dt / (b.chargeTime * this.mods.chargeTime), 0, 1);
    this.action.charge = this.beamCharge;
    if (this.beamCharge >= 1) {
      this.fireEnd = Number.POSITIVE_INFINITY;
      this.enter('beamFire');
      this.action.charge = 1;
    }
    return this.aimAllowance(input);
  }

  private updateFire(dt: number, input: CombatInput): MovementAllowance {
    const b = this.cfg.beam;
    const t = this.action.t;
    if (this.fireEnd === Number.POSITIVE_INFINITY) {
      if (!input.beamHeld) {
        // Let go: stop right away with a short recovery.
        this.fireEnd = t;
        this.stopRecovery = b.cancelRecovery;
      } else if (t >= b.startup + b.maxDuration) {
        this.fireEnd = t;
        this.stopRecovery = b.recovery;
      } else if (t >= b.startup) {
        if (this.energy.spend(b.energyPerSecond * dt)) {
          this.emitBeam(input, b.dps * this.mods.beamDamage * dt);
        } else {
          // Out of energy.
          this.fireEnd = t;
          this.stopRecovery = b.recovery;
        }
      }
    }
    if (this.fireEnd !== Number.POSITIVE_INFINITY && t >= this.fireEnd + this.stopRecovery) {
      // Cooldown scales with how long the beam actually ran.
      const fired = Math.max(0, this.fireEnd - b.startup) / Math.max(0.01, b.maxDuration);
      this.cooldowns.start('beam', b.cooldown * clamp(fired, 0.25, 1));
      this.beamCharge = 0;
      this.toIdle();
      return FREE;
    }
    this.action.charge = this.fireEnd === Number.POSITIVE_INFINITY ? 1 : Math.max(0, 1 - (t - this.fireEnd) / Math.max(0.01, this.stopRecovery));
    return this.aimAllowance(input);
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
    const a = clampBeamAim(aimYaw, aimPitch, yaw, this.cfg.beam);
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
      // Don't spin when the aim point is basically under the titan.
      if (Math.hypot(input.aim.x - p.x, input.aim.z - p.z) >= 10) {
        faceYaw = wrapAngle(Math.atan2(input.aim.x - p.x, input.aim.z - p.z));
      }
    }
    return { moveMultiplier: 0, turnMultiplier: 0, faceYaw, faceRate: this.cfg.beam.turnRate, lungeSpeed: 0 };
  }

  private enter(state: TitanState): void {
    this.action.kind = state;
    this.action.t = 0;
    this.action.move = null;
    if (state !== 'beamCharge' && state !== 'beamFire') this.action.charge = 0;
    this.emitted = 0;
    this.body.setState(state);
  }

  private toIdle(): void {
    this.enter('idle');
  }
}
