import { describe, expect, it } from 'vitest';
import { SHAKE } from '../config/camera';
import { CameraShake } from './CameraShake';

describe('CameraShake', () => {
  it('clamps trauma to 1 and decays it to 0', () => {
    const s = new CameraShake(SHAKE);
    s.addTrauma(0.8);
    s.addTrauma(0.8);
    expect(s.trauma).toBe(1);
    for (let i = 0; i < 600; i++) s.update(1 / 60);
    expect(s.trauma).toBe(0);
    expect(Math.abs(s.offset.x)).toBe(0);
  });

  it('scales offsets with trauma squared', () => {
    const s = new CameraShake(SHAKE);
    s.addTrauma(1);
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      s.update(1 / 60);
      peak = Math.max(peak, Math.abs(s.offset.x));
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(SHAKE.maxOffset);
  });

  it('kick dips the camera then settles', () => {
    const s = new CameraShake(SHAKE);
    s.addKick(10);
    s.update(1 / 60);
    expect(s.offset.y).toBeLessThan(0);
    for (let i = 0; i < 600; i++) s.update(1 / 60);
    expect(Math.abs(s.offset.y)).toBeLessThan(0.01);
  });
});
