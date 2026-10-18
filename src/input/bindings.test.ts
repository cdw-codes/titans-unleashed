import { describe, expect, it } from 'vitest';
import { BINDINGS } from '../config/input';
import { codeLabel, defaultBindings, parseBindings, rebind, unbind } from './bindingsStore';

describe('bindings store', () => {
  it('rebinding moves a code away from its previous action', () => {
    const b = rebind(defaultBindings(), 'roar', 0, 'KeyE')!;
    expect(b.roar).toEqual(['KeyE']);
    expect(b.beam).toEqual([]); // E was the beam key
  });

  it('fills a second slot and caps at two', () => {
    let b = rebind(defaultBindings(), 'stomp', 1, 'KeyX')!;
    expect(b.stomp).toEqual(['Space', 'KeyX']);
    b = rebind(b, 'stomp', 5, 'KeyZ') ?? b;
    expect(b.stomp).toHaveLength(2);
  });

  it('refuses Escape (it releases the mouse)', () => {
    expect(rebind(defaultBindings(), 'roar', 0, 'Escape')).toBeNull();
  });

  it('unbinds a slot', () => {
    expect(unbind(defaultBindings(), 'lockOn', 1).lockOn).toEqual(['KeyQ']);
  });

  it('parses saves defensively', () => {
    expect(parseBindings(null)).toEqual(defaultBindings());
    expect(parseBindings('{bad json')).toEqual(defaultBindings());
    const p = parseBindings(JSON.stringify({ roar: ['KeyT'], beam: 'nope', unknown: ['KeyY'], stomp: ['Escape'] }));
    expect(p.roar).toEqual(['KeyT']);
    expect(p.beam).toEqual([...BINDINGS.beam]);
    expect(p.stomp).toEqual([...BINDINGS.stomp]);
  });

  it('labels codes for humans', () => {
    expect(codeLabel('KeyW')).toBe('W');
    expect(codeLabel('Mouse2')).toBe('RMB');
    expect(codeLabel('Digit3')).toBe('3');
    expect(codeLabel('ShiftLeft')).toBe('L-Shift');
  });
});
