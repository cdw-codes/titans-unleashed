import { describe, expect, it } from 'vitest';
import { TITAN_GAIT, TITAN_MOVEMENT } from '../../config/titan';
import { TitanMotor } from './TitanMotor';
import { Gait, type Foot } from './Gait';
import { locomotionState } from './locomotion';

const DT = 1 / 60;
const run = (m: TitanMotor, x: number, z: number, sprint: boolean, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) m.update({ x, z, sprint }, DT);
};

describe('TitanMotor', () => {
  it('accelerates gradually to walk speed', () => {
    const m = new TitanMotor(TITAN_MOVEMENT);
    run(m, 0, 1, false, 0.5);
    expect(m.speed).toBeGreaterThan(0);
    expect(m.speed).toBeLessThan(TITAN_MOVEMENT.walkSpeed);
    run(m, 0, 1, false, 10);
    expect(m.speed).toBeCloseTo(TITAN_MOVEMENT.walkSpeed, 5);
  });

  it('reaches sprint speed more slowly than walk speed', () => {
    const m = new TitanMotor(TITAN_MOVEMENT);
    run(m, 0, 1, true, 20);
    expect(m.speed).toBeCloseTo(TITAN_MOVEMENT.sprintSpeed, 5);
    const t = TITAN_MOVEMENT.sprintSpeed / TITAN_MOVEMENT.sprintAcceleration;
    expect(t).toBeGreaterThan(TITAN_MOVEMENT.walkSpeed / TITAN_MOVEMENT.acceleration);
  });

  it('turns at a limited rate', () => {
    const m = new TitanMotor(TITAN_MOVEMENT);
    m.update({ x: 1, z: 0, sprint: false }, DT);
    expect(m.yaw).toBeCloseTo(TITAN_MOVEMENT.turnRate * DT, 6);
  });

  it('nearly stops instead of moonwalking when told to reverse', () => {
    const m = new TitanMotor(TITAN_MOVEMENT);
    run(m, 0, 1, false, 10);
    run(m, 0, -1, false, 0.8);
    expect(m.speed).toBeLessThan(TITAN_MOVEMENT.walkSpeed * 0.6);
    run(m, 0, -1, false, 10);
    expect(Math.abs(Math.abs(m.yaw) - Math.PI)).toBeLessThan(1e-3);
    expect(m.velocityZ).toBeLessThan(0);
  });

  it('coasts to a stop on release', () => {
    const m = new TitanMotor(TITAN_MOVEMENT);
    run(m, 0, 1, false, 10);
    m.update({ x: 0, z: 0, sprint: false }, DT);
    expect(m.speed).toBeGreaterThan(0);
    run(m, 0, 0, false, 5);
    expect(m.speed).toBe(0);
  });
});

describe('TitanMotor strafe mode', () => {
  it('keeps facing the target while side-stepping slower than walking', () => {
    const m = new TitanMotor(TITAN_MOVEMENT);
    for (let i = 0; i < 600; i++) m.update({ x: 1, z: 0, sprint: true, faceYaw: 0 }, DT);
    expect(m.yaw).toBeCloseTo(0, 5);
    expect(m.sprinting).toBe(false);
    expect(m.velocityX).toBeGreaterThan(0);
    expect(m.speed).toBeCloseTo(TITAN_MOVEMENT.walkSpeed * TITAN_MOVEMENT.strafeSpeedFactor, 3);
  });

  it('backpedals slowest', () => {
    const m = new TitanMotor(TITAN_MOVEMENT);
    for (let i = 0; i < 900; i++) m.update({ x: 0, z: -1, sprint: false, faceYaw: 0 }, DT);
    expect(m.velocityZ).toBeLessThan(0);
    expect(m.speed).toBeCloseTo(TITAN_MOVEMENT.walkSpeed * TITAN_MOVEMENT.backpedalSpeedFactor, 3);
  });

  it('lunges forward at a forced speed', () => {
    const m = new TitanMotor(TITAN_MOVEMENT);
    m.lungeForward(50);
    m.update({ x: 0, z: 0, sprint: false }, DT);
    expect(m.speed).toBe(50);
    expect(m.velocityZ).toBeCloseTo(50);
  });
});

describe('Gait', () => {
  it('plants alternating feet every half stride', () => {
    const g = new Gait(TITAN_GAIT);
    const steps: Foot[] = [];
    const speed = 10;
    let dist = 0;
    while (dist < TITAN_GAIT.walkStride * 2 + 1) {
      const f = g.update(speed * DT, 0, false, DT);
      if (f) steps.push(f);
      dist += speed * DT;
    }
    expect(steps).toEqual(['right', 'left', 'right', 'left']);
  });

  it('finishes the current step after stopping, then rests', () => {
    const g = new Gait(TITAN_GAIT);
    g.update(TITAN_GAIT.walkStride * 0.2, 0, false, DT);
    let foot: Foot | null = null;
    for (let i = 0; i < 600 && !foot; i++) foot = g.update(0, 0, false, DT);
    expect(foot).toBe('right');
    expect(g.phase).toBe(0.5);
    expect(g.update(0, 0, false, DT)).toBeNull();
    expect(g.phase).toBe(0.5);
  });

  it('shuffles feet when pivoting on the spot', () => {
    const g = new Gait(TITAN_GAIT);
    let steps = 0;
    for (let i = 0; i < 600; i++) if (g.update(0, TITAN_MOVEMENT.turnRate * DT, false, DT)) steps++;
    expect(steps).toBeGreaterThan(0);
  });
});

describe('Gait at walking speed', () => {
  it('steps in sync with distance (no foot sliding)', () => {
    const g = new Gait(TITAN_GAIT);
    let steps = 0;
    const seconds = 20;
    for (let i = 0; i < seconds * 60; i++) if (g.update(TITAN_MOVEMENT.walkSpeed * DT, 0, false, DT)) steps++;
    const expected = (TITAN_MOVEMENT.walkSpeed * seconds) / (TITAN_GAIT.walkStride / 2);
    expect(Math.abs(steps - expected)).toBeLessThanOrEqual(1);
  });
});

describe('locomotionState', () => {
  it('maps speed to idle/walk/sprint', () => {
    expect(locomotionState(0, false, TITAN_MOVEMENT)).toBe('idle');
    expect(locomotionState(5, false, TITAN_MOVEMENT)).toBe('walk');
    expect(locomotionState(5, true, TITAN_MOVEMENT)).toBe('walk');
    expect(locomotionState(15, true, TITAN_MOVEMENT)).toBe('sprint');
  });
});
