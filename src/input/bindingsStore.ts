import { BINDINGS, type Action, type Bindings } from '../config/input';

const KEY = 'kaiju.bindings';
/** Codes that can never be bound (they control the browser / pointer lock). */
const RESERVED = new Set(['Escape']);
/** Max codes per action. */
export const SLOTS = 2;

export const ACTIONS = Object.keys(BINDINGS) as Action[];

export function defaultBindings(): Record<Action, string[]> {
  return Object.fromEntries(ACTIONS.map((a) => [a, [...BINDINGS[a]]])) as Record<Action, string[]>;
}

/**
 * Bind `code` to `action` in `slot`. The code is removed from any other
 * action first (no double bindings). Returns a new table; null if refused.
 */
export function rebind(b: Bindings, action: Action, slot: number, code: string): Record<Action, string[]> | null {
  if (RESERVED.has(code) || slot < 0 || slot >= SLOTS) return null;
  const next = Object.fromEntries(ACTIONS.map((a) => [a, b[a].filter((c) => c !== code)])) as Record<Action, string[]>;
  const codes = next[action];
  if (slot < codes.length) codes[slot] = code;
  else codes.push(code);
  next[action] = [...new Set(codes)].slice(0, SLOTS);
  return next;
}

/** Remove the code in `slot` (an action may end up unbound). */
export function unbind(b: Bindings, action: Action, slot: number): Record<Action, string[]> {
  const next = Object.fromEntries(ACTIONS.map((a) => [a, [...b[a]]])) as Record<Action, string[]>;
  next[action].splice(slot, 1);
  return next;
}

/** Parse saved overrides; anything invalid falls back to the default for that action. */
export function parseBindings(json: string | null): Record<Action, string[]> {
  const out = defaultBindings();
  if (!json) return out;
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    for (const a of ACTIONS) {
      const v = data[a];
      if (Array.isArray(v) && v.every((c) => typeof c === 'string' && !RESERVED.has(c))) out[a] = v.slice(0, SLOTS) as string[];
    }
  } catch {
    // Corrupt save: defaults.
  }
  return out;
}

export function loadBindings(): Record<Action, string[]> {
  try {
    return parseBindings(localStorage.getItem(KEY));
  } catch {
    return defaultBindings();
  }
}

export function saveBindings(b: Bindings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // Storage unavailable: remap lasts for this session only.
  }
}

export function clearBindings(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Human label for an input code. */
export function codeLabel(code: string): string {
  const named: Record<string, string> = {
    Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps',
  };
  if (named[code]) return named[code]!;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
