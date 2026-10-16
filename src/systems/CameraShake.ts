import { clamp, noise1D, Spring } from '../core/math';
import type { ShakeConfig } from '../config/camera';

/**
 * Trauma-based shake (offset ∝ trauma², smooth noise) plus a vertical kick spring
 * for directional "thud" on heavy impacts. Pure logic; the camera applies the output.
 */
export class CameraShake {
  trauma = 0;
  readonly offset = { x: 0, y: 0, roll: 0, yaw: 0, pitch: 0 };
  private readonly kick: Spring;
  private t = 0;

  constructor(private readonly cfg: ShakeConfig) {
    this.kick = new Spring(cfg.kickFrequency, cfg.kickDamping);
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Downward velocity impulse (m/s); the spring brings the camera back. */
  addKick(velocity: number): void {
    this.kick.impulse(-velocity);
  }

  update(dt: number): void {
    const c = this.cfg;
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - c.decay * dt);
    const s = this.trauma * this.trauma;
    const f = this.t * c.frequency;
    this.offset.x = c.maxOffset * s * noise1D(f, 1);
    this.offset.y = c.maxOffset * s * noise1D(f, 2) + this.kick.update(dt);
    this.offset.roll = c.maxRoll * s * noise1D(f, 3);
    this.offset.yaw = c.maxAngle * s * noise1D(f, 4);
    this.offset.pitch = c.maxAngle * s * noise1D(f, 5);
  }
}
