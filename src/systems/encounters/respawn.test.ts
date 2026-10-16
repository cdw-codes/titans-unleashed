import { describe, expect, it } from 'vitest';
import { respawnPoint } from './respawn';

const base = { minDistance: 900, maxX: 1500, pitch: 128, rand: () => 0.3 };

describe('respawnPoint', () => {
  it('moves away from the rival by at least the minimum distance', () => {
    const p = respawnPoint({ ...base, fromX: 0, fromZ: 0, threat: { x: 50, z: 0 } });
    expect(Math.hypot(p.x - 50, p.z)).toBeGreaterThanOrEqual(900);
    expect(p.x).toBeLessThan(0); // the side opposite the rival
  });

  it('lands on a street intersection', () => {
    const p = respawnPoint({ ...base, fromX: 37, fromZ: -211, threat: { x: 90, z: -150 } });
    expect(Math.abs(p.x % 128)).toBe(0);
    expect(Math.abs(p.z % 128)).toBe(0);
  });

  it('never respawns in the sea', () => {
    const p = respawnPoint({ ...base, fromX: 1400, fromZ: 0, threat: { x: 1300, z: 0 } });
    expect(p.x).toBeLessThanOrEqual(1500);
    expect(Math.hypot(p.x - 1300, p.z)).toBeGreaterThanOrEqual(850);
  });

  it('picks a random direction without a rival, away from the death spot', () => {
    const p = respawnPoint({ ...base, fromX: 0, fromZ: 0, threat: null });
    expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(900);
  });

  it('handles dying right on top of the rival', () => {
    const p = respawnPoint({ ...base, fromX: 10, fromZ: 10, threat: { x: 10, z: 10 } });
    expect(Math.hypot(p.x - 10, p.z - 10)).toBeGreaterThanOrEqual(900);
  });

  it('faces back toward the fight', () => {
    const p = respawnPoint({ ...base, fromX: 0, fromZ: 0, threat: { x: 0, z: 100 } });
    expect(Math.cos(p.yaw)).toBeGreaterThan(0.9); // looking toward +Z
  });
});
