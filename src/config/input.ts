/**
 * Action -> input codes. Keyboard codes are KeyboardEvent.code values;
 * mouse buttons are `Mouse0` (left), `Mouse1` (middle), `Mouse2` (right).
 * These are the defaults; players can remap (input/bindingsStore.ts persists overrides).
 */
export const BINDINGS = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  claw: ['Mouse0'],
  tail: ['Mouse2'],
  stomp: ['Space'],
  beam: ['KeyE'],
  roar: ['KeyR'],
  pulse: ['KeyF'],
  lockOn: ['KeyQ', 'Mouse1'],
  debug: ['F1'],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof BINDINGS;

/** Labels for the controls screen, in display order. */
export const ACTION_LABELS: Readonly<Record<Action, string>> = {
  moveForward: 'Move forward',
  moveBack: 'Move back',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  sprint: 'Sprint',
  claw: 'Claw',
  tail: 'Tail sweep',
  stomp: 'Stomp',
  beam: 'Beam (hold)',
  roar: 'Roar',
  pulse: 'Atomic Pulse',
  lockOn: 'Lock on',
  debug: 'Debug view',
};
export type Bindings = Readonly<Record<Action, readonly string[]>>;

export interface MouseConfig {
  /** Radians per pixel of pointer-locked mouse movement. */
  readonly sensitivity: number;
  readonly invertY: boolean;
}

export const MOUSE: MouseConfig = {
  sensitivity: 0.0022,
  invertY: false,
};
