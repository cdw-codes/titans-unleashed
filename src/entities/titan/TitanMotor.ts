import { approach, approachAngle, lerp, wrapAngle } from '../../core/math';
import type { TitanMovementConfig } from '../../config/titan';

/** What a controller (player input or AI) asks the body to do this tick. */
export interface MoveIntent {
  /** World-space wished direction on the ground plane; length 0..1. */
  x: number;
  z: number;
  sprint: boolean;
  /**
   * Strafe mode: keep facing this yaw (lock-on target) and move in the wished
   * direction sideways/backwards at reduced speed. null = normal (face the move).
   */
  faceYaw?: number | null;
}

/**
 * Heavy locomotion, pure logic. Normally the body only moves the way it faces;
 * it turns at a limited rate and withholds speed while facing away from the
 * wished direction, so reversing means slowing, pivoting, then lumbering off.
 * In strafe mode it faces a target and side-steps/backpedals slowly instead.
 */
export class TitanMotor {
  /** Facing yaw; 0 = +Z. */
  yaw = 0;
  /** Direction of travel; equals `yaw` except when strafing. */
  moveYaw = 0;
  /** Ground speed (m/s), >= 0. */
  speed = 0;
  /** Signed turn rate this tick (rad/s), for leaning and gait. */
  turnVelocity = 0;
  sprinting = false;
  /** Forced forward speed this tick (lunges), or 0. */
  private lunge = 0;
  /** Upgrade multiplier on all target speeds. */
  speedMultiplier = 1;

  constructor(readonly cfg: TitanMovementConfig) {}

  /** `turnScale` scales the turn rate (attacks that limit turning). */
  update(intent: MoveIntent, dt: number, turnScale = 1): void {
    const c = this.cfg;
    const mag = Math.min(1, Math.hypot(intent.x, intent.z));
    const strafing = intent.faceYaw !== undefined && intent.faceYaw !== null;
    this.sprinting = !strafing && intent.sprint && mag > 0.1;

    let targetSpeed = 0;
    const prevYaw = this.yaw;
    if (strafing) {
      this.yaw = approachAngle(this.yaw, intent.faceYaw!, c.turnRate * turnScale * dt);
      if (mag > 0.01) {
        const wishYaw = Math.atan2(intent.x, intent.z);
        // Forward 1 → sideways strafe factor → backwards backpedal factor.
        const off = Math.abs(wrapAngle(wishYaw - this.yaw)) / Math.PI;
        const factor = off < 0.5 ? lerp(1, c.strafeSpeedFactor, off * 2) : lerp(c.strafeSpeedFactor, c.backpedalSpeedFactor, off * 2 - 1);
        targetSpeed = c.walkSpeed * mag * factor;
        // Travel direction swings toward the wish at the turn rate (no instant reversals).
        this.moveYaw = approachAngle(this.moveYaw, wishYaw, c.turnRate * 2 * dt);
      }
    } else {
      if (mag > 0.01) {
        const wishYaw = Math.atan2(intent.x, intent.z);
        const rate = (this.sprinting ? c.sprintTurnRate : c.turnRate) * turnScale;
        this.yaw = approachAngle(this.yaw, wishYaw, rate * dt);
        const alignment = Math.max(0, Math.cos(wrapAngle(wishYaw - this.yaw)));
        const factor = 1 - c.turnSlowdown * (1 - alignment);
        targetSpeed = (this.sprinting ? c.sprintSpeed : c.walkSpeed) * mag * factor;
      }
      this.moveYaw = this.yaw;
    }
    this.turnVelocity = dt > 0 ? wrapAngle(this.yaw - prevYaw) / dt : 0;

    if (this.lunge > 0) {
      this.moveYaw = this.yaw;
      this.speed = this.lunge;
      this.lunge = 0;
      return;
    }
    targetSpeed *= this.speedMultiplier;
    const rate = targetSpeed > this.speed ? (this.sprinting ? c.sprintAcceleration : c.acceleration) : c.deceleration;
    this.speed = approach(this.speed, targetSpeed, rate * dt);
  }

  /** Rotate toward `yaw` without moving (aiming the beam). Call after update(). */
  faceToward(yaw: number, rate: number, dt: number): void {
    const prev = this.yaw;
    this.yaw = approachAngle(this.yaw, yaw, rate * dt);
    if (this.speed < 0.5) this.moveYaw = this.yaw;
    if (dt > 0) this.turnVelocity += wrapAngle(this.yaw - prev) / dt;
  }

  /** Dash forward at `speed` on the next update (lunge attacks). */
  lungeForward(speed: number): void {
    this.lunge = speed;
  }

  get velocityX(): number {
    return Math.sin(this.moveYaw) * this.speed;
  }

  get velocityZ(): number {
    return Math.cos(this.moveYaw) * this.speed;
  }
}
