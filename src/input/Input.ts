import { BINDINGS, type Action } from '../config/input';
import { InputState } from './InputState';

type ActionListener = (action: Action) => void;

/** Browser wiring for keyboard, mouse buttons, pointer-locked mouse movement. */
export class Input {
  readonly state = new InputState(BINDINGS);
  private mouseDX = 0;
  private mouseDY = 0;
  private locked = false;
  private readonly lockListeners = new Set<(locked: boolean) => void>();
  private readonly immediateListeners = new Set<ActionListener>();

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.handleLockChange);
  }

  get isLocked(): boolean {
    return this.locked;
  }

  async requestLock(): Promise<void> {
    if (this.locked) return;
    try {
      // Raw mouse input avoids OS acceleration where supported.
      await this.element.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await this.element.requestPointerLock();
      } catch {
        // Browsers refuse re-locking for ~1s after Esc; the overlay stays up and the next click retries.
      }
    }
  }

  onLockChange(fn: (locked: boolean) => void): void {
    this.lockListeners.add(fn);
  }

  /** Fires at event time, independent of the sim (for UI toggles like F1). */
  onImmediateAction(fn: ActionListener): void {
    this.immediateListeners.add(fn);
  }

  /** Mouse movement since the last call, in pixels. Consumed at render rate by the camera. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  private emitImmediate(code: string): void {
    const action = this.state.actionFor(code);
    if (action) for (const fn of this.immediateListeners) fn(action);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'F1' || (this.locked && e.code === 'Space')) e.preventDefault();
    if (!e.repeat) this.emitImmediate(e.code);
    if (this.locked) this.state.press(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.state.release(e.code);
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button === 1) e.preventDefault(); // suppress autoscroll
    if (!this.locked) return;
    const code = `Mouse${e.button}`;
    this.emitImmediate(code);
    this.state.press(code);
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.state.release(`Mouse${e.button}`);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private readonly onBlur = (): void => {
    this.state.releaseAll();
  };

  private readonly handleLockChange = (): void => {
    this.locked = document.pointerLockElement === this.element;
    if (!this.locked) this.state.releaseAll();
    this.mouseDX = this.mouseDY = 0;
    for (const fn of this.lockListeners) fn(this.locked);
  };
}
