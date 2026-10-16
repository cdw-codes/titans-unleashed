import type { BeamConfig, MoveConfig } from '../../config/combat';
import { clamp, lerp, wrapAngle } from '../../core/math';

export type MovePhase = 'windup' | 'active' | 'recovery' | 'done';

/** Phase of a timed move at `t` seconds after it started. */
export function movePhase(t: number, m: Pick<MoveConfig, 'windup' | 'active' | 'recovery'>): MovePhase {
  if (t < m.windup) return 'windup';
  if (t < m.windup + m.active) return 'active';
  if (t < m.windup + m.active + m.recovery) return 'recovery';
  return 'done';
}

export function moveLength(m: Pick<MoveConfig, 'windup' | 'active' | 'recovery'>): number {
  return m.windup + m.active + m.recovery;
}

/**
 * Does a target circle (center tx/tz, radius tr) overlap an attack arc?
 * Arc: origin, facing yaw (0 = +Z), radius, full arc width and offset in degrees.
 */
export function inArc(
  ox: number, oz: number, facingYaw: number,
  radius: number, arcDeg: number, arcOffsetDeg: number,
  tx: number, tz: number, tr: number,
): boolean {
  const dx = tx - ox;
  const dz = tz - oz;
  const dist = Math.hypot(dx, dz);
  if (dist - tr > radius) return false;
  if (arcDeg >= 360 || dist < tr) return true;
  const center = facingYaw + (arcOffsetDeg * Math.PI) / 180;
  const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - center));
  // Widen the arc by the target's angular size so big buildings at the edge still count.
  const angularSize = Math.asin(Math.min(1, tr / dist));
  return off <= (arcDeg * Math.PI) / 360 + angularSize;
}

/** Damage with linear falloff from center (1) to edge (edgeFalloff). */
export function falloffDamage(damage: number, dist: number, radius: number, edgeFalloff: number): number {
  const t = clamp(dist / radius, 0, 1);
  return damage * lerp(1, edgeFalloff, t);
}

export class Cooldowns<K extends string> {
  private readonly ready = new Map<K, number>();
  private now = 0;

  tick(dt: number): void {
    this.now += dt;
  }

  /** Mark `key` unavailable for `seconds` from now. */
  start(key: K, seconds: number): void {
    this.ready.set(key, this.now + seconds);
  }

  isReady(key: K): boolean {
    return this.now >= (this.ready.get(key) ?? 0);
  }

  /** 0 = ready, 1 = just started. */
  remainingFraction(key: K, total: number): number {
    if (total <= 0) return 0;
    return clamp(((this.ready.get(key) ?? 0) - this.now) / total, 0, 1);
  }
}

/** Clamp a beam direction (yaw/pitch, radians) to the body's facing and pitch limits. */
export function clampBeamAim(aimYaw: number, aimPitch: number, facingYaw: number, b: BeamConfig): { yaw: number; pitch: number } {
  const maxOff = (b.maxYawOffsetDeg * Math.PI) / 180;
  const off = clamp(wrapAngle(aimYaw - facingYaw), -maxOff, maxOff);
  return {
    yaw: wrapAngle(facingYaw + off),
    pitch: clamp(aimPitch, (b.minPitchDeg * Math.PI) / 180, (b.maxPitchDeg * Math.PI) / 180),
  };
}
