import { describe, expect, it } from 'vitest';
import { snapToTexelGrid } from './shadowSnap';

const right = { x: 1, y: 0, z: 0 };
const up = { x: 0, y: 0.6, z: -0.8 }; // unit, orthogonal to right

describe('snapToTexelGrid', () => {
  it('lands on texel multiples in light space', () => {
    const out = { x: 0, y: 0, z: 0 };
    snapToTexelGrid({ x: 10.37, y: 3, z: -7.2 }, right, up, 0.5, out);
    const r = out.x;
    const u = out.y * up.y + out.z * up.z;
    expect(r / 0.5).toBeCloseTo(Math.round(r / 0.5), 6);
    expect(u / 0.5).toBeCloseTo(Math.round(u / 0.5), 6);
  });

  it('moves the point by at most half a texel per axis', () => {
    const out = { x: 0, y: 0, z: 0 };
    const p = { x: 123.4, y: 0, z: 56.7 };
    snapToTexelGrid(p, right, up, 0.3, out);
    const d = Math.hypot(out.x - p.x, out.y - p.y, out.z - p.z);
    expect(d).toBeLessThanOrEqual(Math.SQRT2 * 0.15 + 1e-9);
  });
});
