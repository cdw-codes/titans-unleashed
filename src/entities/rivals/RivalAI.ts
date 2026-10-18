import type { AIAttack, RivalAIConfig } from '../../config/rivals';
import { wrapAngle } from '../../core/math';
import type { Random } from '../../core/random';
import type { CombatInput, CooldownId } from '../titan/TitanCombat';
import type { MoveIntent } from '../titan/TitanMotor';

export type AIState = 'idle' | 'approach' | 'circle' | 'retreat' | 'aim' | 'charging' | 'busy';

/** What the AI can see this tick. Plain data so the AI is testable without the engine. */
export interface Perception {
  x: number;
  z: number;
  yaw: number;
  /** Rooted in a move, staggered, down... (no new decisions). */
  busy: boolean;
  /** Charging or firing the beam (the AI must keep holding the key). */
  charging: boolean;
  firing: boolean;
  charge: number;
  canStart(id: CooldownId): boolean;
  target: { x: number; y: number; z: number } | null;
}

/**
 * Small, readable decision system. Every `reactionDelay` seconds it picks a
 * plan from distance, cooldowns and personality (aggression, preferred range);
 * between decisions it keeps executing that plan. Outputs the same MoveIntent /
 * CombatInput a player would, so rivals use the exact same body and moves.
 */
export class RivalAI {
  state: AIState = 'idle';
  private timer = 0;
  private circleDir: 1 | -1 = 1;
  private pending: AIAttack['move'] | null = null;
  private aimTime = 0;
  private beamTime = 0;
  readonly intent: MoveIntent = { x: 0, z: 0, sprint: false, faceYaw: null };
  readonly combat: CombatInput = { claw: false, tail: false, stomp: false, roar: false, beamHeld: false, lunge: false, volley: false, aim: null };
  private readonly aimPoint = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly cfg: RivalAIConfig,
    private readonly rng: Random,
  ) {}

  update(dt: number, p: Perception): void {
    this.clearPresses();
    const t = p.target;
    if (!t) {
      this.state = 'idle';
      this.setMove(0, 0, false, null);
      return;
    }
    this.aimPoint.x = t.x;
    this.aimPoint.y = t.y;
    this.aimPoint.z = t.z;
    this.combat.aim = this.aimPoint;
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const dist = Math.hypot(dx, dz);
    const toTarget = Math.atan2(dx, dz);

    // Beam: keep holding through the charge, then for beamFireSeconds of firing.
    if (p.charging || p.firing) {
      this.state = 'charging';
      this.beamTime = p.firing ? this.beamTime + dt : 0;
      this.combat.beamHeld = this.beamTime < this.cfg.beamFireSeconds;
      this.setMove(0, 0, false, toTarget);
      return;
    }
    if (p.busy) {
      this.state = 'busy';
      this.pending = null;
      this.setMove(0, 0, false, null);
      return;
    }
    if (this.state === 'busy') this.state = 'idle';

    this.timer -= dt;
    if (this.timer <= 0 && this.state !== 'aim') {
      this.timer = this.cfg.reactionDelay * (0.8 + this.rng.next() * 0.4);
      this.decide(dist, p);
    }

    switch (this.state) {
      case 'aim': {
        // Turn to face, then commit.
        this.aimTime += dt;
        const err = Math.abs(wrapAngle(toTarget - p.yaw));
        this.setMove(0, 0, false, toTarget);
        if (err <= (this.cfg.attackFacingDeg * Math.PI) / 180 || this.aimTime > 0.8) this.press(this.pending!);
        return;
      }
      case 'approach':
        this.setMove(dx / dist, dz / dist, dist > this.cfg.sprintRange, null);
        return;
      case 'retreat':
        this.setMove(-dx / dist, -dz / dist, false, toTarget);
        return;
      case 'circle': {
        // Tangent around the target, nudged back toward the preferred range.
        const radial = (dist - this.cfg.preferredRange) / Math.max(1, this.cfg.rangeTolerance);
        const tx = -dz / dist * this.circleDir + (dx / dist) * radial * 0.5;
        const tz = (dx / dist) * this.circleDir + (dz / dist) * radial * 0.5;
        const len = Math.hypot(tx, tz) || 1;
        this.setMove(tx / len, tz / len, false, toTarget);
        return;
      }
      default:
        this.setMove(0, 0, false, toTarget);
    }
  }

  private decide(dist: number, p: Perception): void {
    const c = this.cfg;
    const options = c.attacks.filter((a) => dist >= a.minRange && dist <= a.maxRange && p.canStart(a.move));
    if (options.length && this.rng.next() < c.aggression) {
      this.pending = this.weighted(options);
      this.aimTime = 0;
      this.state = 'aim';
      return;
    }
    if (c.retreatRange > 0 && dist < c.retreatRange) this.state = 'retreat';
    else if (dist > c.preferredRange + c.rangeTolerance) this.state = 'approach';
    else if (dist < c.preferredRange - c.rangeTolerance) this.state = 'retreat';
    else {
      if (this.state !== 'circle' || this.rng.next() < 0.2) this.circleDir = this.rng.next() < 0.5 ? 1 : -1;
      this.state = 'circle';
    }
  }

  private press(move: AIAttack['move']): void {
    if (move === 'beam') this.combat.beamHeld = true;
    else this.combat[move] = true;
    this.pending = null;
    // Next decision only after the move has had a chance to start.
    this.state = 'idle';
    this.timer = this.cfg.reactionDelay;
  }

  private weighted(options: AIAttack[]): AIAttack['move'] {
    const total = options.reduce((s, a) => s + a.weight, 0);
    let r = this.rng.next() * total;
    for (const a of options) {
      r -= a.weight;
      if (r <= 0) return a.move;
    }
    return options[options.length - 1]!.move;
  }

  private setMove(x: number, z: number, sprint: boolean, faceYaw: number | null): void {
    this.intent.x = x;
    this.intent.z = z;
    this.intent.sprint = sprint;
    this.intent.faceYaw = faceYaw;
  }

  private clearPresses(): void {
    const c = this.combat;
    c.claw = c.tail = c.stomp = c.roar = c.lunge = c.volley = false;
    c.beamHeld = false;
  }
}
