/** Small allocation-free math helpers shared by gameplay and visuals. */

export const TAU = Math.PI * 2;

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Hermite step from 0 at `a` to 1 at `b` (works with a > b too). */
export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

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

function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 2D value noise in [0, 1]. Deterministic for a given seed. */
export function noise2D(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

/** Stable integer hash of a chunk coordinate + seed, for per-chunk RNG seeds. */
export function hashCoords(x: number, z: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
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
    // Explicit integration diverges on long frames (a throttled tab): substep.
    const steps = Math.min(64, Math.ceil(dt * 120));
    const h = dt / Math.max(1, steps);
    for (let i = 0; i < steps; i++) {
      const accel = -2 * this.zeta * w * this.velocity - w * w * (this.value - this.target);
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}
