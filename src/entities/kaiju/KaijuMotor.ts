import { approach, approachAngle, wrapAngle } from '../../core/math';
import type { KaijuMovementConfig } from '../../config/kaiju';

/** What a controller (player input or AI) asks the body to do this tick. */
export interface MoveIntent {
  /** World-space wished direction on the ground plane; length 0..1. */
  x: number;
  z: number;
  sprint: boolean;
}

/**
 * Heavy locomotion, pure logic. The body only moves the way it faces; it
 * turns at a limited rate and withholds speed while facing away from the
 * wished direction, so reversing means slowing, pivoting, then lumbering off.
 */
export class KaijuMotor {
  /** Facing yaw; 0 = +Z. */
  yaw = 0;
  /** Forward ground speed (m/s), >= 0. */
  speed = 0;
  /** Signed turn rate this tick (rad/s), for leaning and gait. */
  turnVelocity = 0;
  sprinting = false;

  constructor(private readonly cfg: KaijuMovementConfig) {}

  update(intent: MoveIntent, dt: number): void {
    const c = this.cfg;
    const mag = Math.min(1, Math.hypot(intent.x, intent.z));
    this.sprinting = intent.sprint && mag > 0.1;

    let targetSpeed = 0;
    const prevYaw = this.yaw;
    if (mag > 0.01) {
      const wishYaw = Math.atan2(intent.x, intent.z);
      const rate = this.sprinting ? c.sprintTurnRate : c.turnRate;
      this.yaw = approachAngle(this.yaw, wishYaw, rate * dt);
      const alignment = Math.max(0, Math.cos(wrapAngle(wishYaw - this.yaw)));
      const factor = 1 - c.turnSlowdown * (1 - alignment);
      targetSpeed = (this.sprinting ? c.sprintSpeed : c.walkSpeed) * mag * factor;
    }
    this.turnVelocity = dt > 0 ? wrapAngle(this.yaw - prevYaw) / dt : 0;

    const rate = targetSpeed > this.speed ? (this.sprinting ? c.sprintAcceleration : c.acceleration) : c.deceleration;
    this.speed = approach(this.speed, targetSpeed, rate * dt);
  }

  get velocityX(): number {
    return Math.sin(this.yaw) * this.speed;
  }

  get velocityZ(): number {
    return Math.cos(this.yaw) * this.speed;
  }
}
