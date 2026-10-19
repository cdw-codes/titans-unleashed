import { describe, expect, it } from 'vitest';
import { makeRoomCode, parseRoomCode, readMessage } from './protocol';

describe('room codes', () => {
  it('makes five unambiguous characters and parses user input back', () => {
    const code = makeRoomCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(parseRoomCode(` ${code.toLowerCase().slice(0, 2)} ${code.slice(2)} `)).toBe(code);
  });

  it('rejects codes with the wrong length or ambiguous characters', () => {
    expect(parseRoomCode('ABCD')).toBeNull();
    expect(parseRoomCode('ABC0D')).toBeNull();
    expect(parseRoomCode('ABCIE')).toBeNull();
  });
});

describe('readMessage', () => {
  it('accepts well-formed messages', () => {
    expect(readMessage({ t: 'atk', id: 2, move: 'claw', x: 1, z: 2, yaw: 0.5, r: 60 })).not.toBeNull();
    expect(readMessage({ t: 'hit', id: 2, to: 0, d: 40, p: 30, st: 0 })).not.toBeNull();
    expect(readMessage({ t: 'des', id: 1, k: [3, -2, 14] })).not.toBeNull();
    expect(readMessage({ t: 's', id: 1, s: { p: [1, 2, 3], y: 0, v: 0, r: false, st: 'idle', a: [0, 1, 0, null], b: null, hp: 1 } })).not.toBeNull();
  });

  it('rejects junk from untrusted peers', () => {
    expect(readMessage(null)).toBeNull();
    expect(readMessage('hello')).toBeNull();
    expect(readMessage({ t: 'nuke' })).toBeNull();
    expect(readMessage({ t: 'atk', id: 2, move: 'claw', x: 'NaN', z: 2, yaw: 0, r: 60 })).toBeNull();
    expect(readMessage({ t: 'hit', id: 2, to: 0, d: 1e9, p: 0, st: 0 })).toBeNull();
    expect(readMessage({ t: 'des', id: 1, k: [3, -2] })).toBeNull();
    expect(readMessage({ t: 's', id: 1, s: { p: [1, Infinity, 3], y: 0 } })).toBeNull();
  });
});
