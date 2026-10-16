/** Small allocation-free math helpers shared by gameplay and visuals. */

export const TAU = Math.PI * 2;

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Frame-rate independent exponential smoothing. `halfLife` in seconds (time to close half the gap). */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return target + (current - target) * Math.pow(0.5, dt / halfLife);
}

/** Move `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/** Rotate angle `current` toward `target` by at most `maxDelta`, taking the short way round. */
export function approachAngle(current: number, target: number, maxDelta: number): number {
  const d = wrapAngle(target - current);
  if (Math.abs(d) <= maxDelta) return target;
  return wrapAngle(current + Math.sign(d) * maxDelta);
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1D value noise in [-1, 1]. Deterministic for a given seed. */
export function noise1D(t: number, seed = 0): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 57.3), hash(i + 1 + seed * 57.3), u) * 2 - 1;
}

/**
 * 1D damped spring (semi-implicit Euler). Good for camera kicks and settling:
 * `zeta` < 1 overshoots (bouncy), 1 is critically damped.
 */
export class Spring {
  value = 0;
  velocity = 0;

  constructor(
    public frequency: number,
    public zeta: number,
    public target = 0,
  ) {}

  impulse(v: number): void {
    this.velocity += v;
  }

  update(dt: number): number {
    const w = TAU * this.frequency;
    const accel = -2 * this.zeta * w * this.velocity - w * w * (this.value - this.target);
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}
