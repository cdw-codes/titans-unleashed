import { describe, expect, it } from 'vitest';
import { SnapshotBuffer, type Sample } from './SnapshotBuffer';
import type { TitanState } from './protocol';

const state = (x: number, yaw: number, st = 'walk', t = 0): TitanState => ({
  p: [x, 0, 0], y: yaw, v: 5, r: false, st, a: [t, 1, 0, null], b: null, hp: 1,
});
const out = (): Sample => ({ x: 0, y: 0, z: 0, yaw: 0, speed: 0, sprinting: false, state: '', t: 0, side: 1, charge: 0, move: null, beam: null, hp: 1 });

describe('SnapshotBuffer', () => {
  it('interpolates between the two snapshots around the sample time', () => {
    const b = new SnapshotBuffer();
    b.push(1, state(0, 0));
    b.push(1.1, state(10, 0));
    const o = out();
    expect(b.sample(1.05, o)).toBe(true);
    expect(o.x).toBeCloseTo(5);
  });

  it('turns the short way across ±π', () => {
    const b = new SnapshotBuffer();
    b.push(0, state(0, 3.1));
    b.push(1, state(0, -3.1));
    const o = out();
    b.sample(0.5, o);
    expect(Math.abs(o.yaw)).toBeGreaterThan(3.1);
  });

  it('holds the newest pose and keeps the action clock running', () => {
    const b = new SnapshotBuffer();
    b.push(0, state(0, 0, 'attack', 0.2));
    const o = out();
    b.sample(0.5, o);
    expect(o.x).toBe(0);
    expect(o.state).toBe('attack');
    expect(o.t).toBeCloseTo(0.7);
  });

  it('reports nothing before the first snapshot', () => {
    expect(new SnapshotBuffer().sample(0, out())).toBe(false);
  });
});
