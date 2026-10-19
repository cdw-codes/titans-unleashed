import { describe, expect, it } from 'vitest';
import { codeLabel } from './actions';

describe('codeLabel', () => {
  it('labels codes for humans', () => {
    expect(codeLabel('KeyW')).toBe('W');
    expect(codeLabel('Mouse2')).toBe('RMB');
    expect(codeLabel('Digit3')).toBe('3');
    expect(codeLabel('ShiftLeft')).toBe('L-Shift');
  });
});
