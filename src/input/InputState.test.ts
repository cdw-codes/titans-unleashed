import { describe, expect, it } from 'vitest';
import { BINDINGS } from '../config/input';
import { InputState } from './InputState';

describe('InputState', () => {
  it('maps multiple codes to one action', () => {
    const s = new InputState(BINDINGS);
    s.press('ShiftRight');
    expect(s.isDown('sprint')).toBe(true);
    s.release('ShiftRight');
    expect(s.isDown('sprint')).toBe(false);
  });

  it('buffers a tap until the next tick consumes it', () => {
    const s = new InputState(BINDINGS);
    s.press('Space');
    s.release('Space');
    expect(s.isDown('stomp')).toBe(false);
    expect(s.wasPressed('stomp')).toBe(true);
    s.endTick();
    expect(s.wasPressed('stomp')).toBe(false);
  });

  it('ignores key auto-repeat for presses', () => {
    const s = new InputState(BINDINGS);
    s.press('KeyE');
    s.endTick();
    s.press('KeyE');
    expect(s.wasPressed('beam')).toBe(false);
    expect(s.isDown('beam')).toBe(true);
  });

  it('reports releases (beam charge -> fire)', () => {
    const s = new InputState(BINDINGS);
    s.press('KeyE');
    s.endTick();
    s.release('KeyE');
    expect(s.wasReleased('beam')).toBe(true);
  });

  it('releaseAll clears held keys (focus loss)', () => {
    const s = new InputState(BINDINGS);
    s.press('KeyW');
    s.releaseAll();
    expect(s.isDown('moveForward')).toBe(false);
  });

  it('resolves codes to actions', () => {
    const s = new InputState(BINDINGS);
    expect(s.actionFor('F1')).toBe('debug');
    expect(s.actionFor('Mouse1')).toBe('lockOn');
    expect(s.actionFor('KeyZ')).toBeUndefined();
  });
});
