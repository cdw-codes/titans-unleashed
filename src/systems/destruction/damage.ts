import type { DestructionConfig } from '../../config/destruction';
import type { StructureSpec } from '../../world/city/types';

export function maxHpFor(s: StructureSpec, c: DestructionConfig): number {
  if (s.size !== 'large') return 1;
  const volume = s.halfW * 2 * s.halfD * 2 * s.height;
  return Math.max(c.minHp, Math.sqrt(volume) * c.hpPerSqrtVolume);
}

/** Damage applied this tick while pushing into a structure. */
export function pushDamage(dt: number, sprinting: boolean, c: DestructionConfig): number {
  return c.pushDps * (sprinting ? c.sprintPushMultiplier : 1) * dt;
}

export function impactDamage(speed: number, c: DestructionConfig): number {
  return Math.max(0, speed) * c.impactDamagePerMps;
}

export function pointsFor(s: StructureSpec, c: DestructionConfig): number {
  return Math.round(c.points[s.kind] + (s.size === 'large' ? s.height * c.pointsPerMeter : 0));
}

export function collapseDuration(height: number, c: DestructionConfig): number {
  return Math.min(c.collapseMaxSeconds, Math.max(c.collapseMinSeconds, height * c.collapseSecondsPerMeter));
}

/** Camera trauma from a collapse: bigger and closer = stronger. */
export function collapseTrauma(height: number, distance: number, c: DestructionConfig): number {
  const falloff = Math.max(0, 1 - distance / c.traumaFalloffDistance);
  return (height / 100) * c.collapseTraumaPer100m * falloff * falloff;
}
