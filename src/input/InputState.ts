import type { Action, Bindings } from '../config/input';

/**
 * DOM-free input state. Tracks held codes and presses buffered until the next
 * simulation tick consumes them, so a tap is never lost on frames that run
 * zero fixed steps (high refresh rate) or double-counted on frames that run several.
 */
export class InputState {
  private readonly held = new Set<string>();
  private readonly pressedBuffer = new Set<string>();
  private readonly releasedBuffer = new Set<string>();

  constructor(private readonly bindings: Bindings) {}

  press(code: string): void {
    if (!this.held.has(code)) this.pressedBuffer.add(code);
    this.held.add(code);
  }

  release(code: string): void {
    if (this.held.delete(code)) this.releasedBuffer.add(code);
  }

  releaseAll(): void {
    for (const c of this.held) this.releasedBuffer.add(c);
    this.held.clear();
  }

  isDown(action: Action): boolean {
    return this.bindings[action].some((c) => this.held.has(c));
  }

  /** True on the first sim tick after the action was pressed. */
  wasPressed(action: Action): boolean {
    return this.bindings[action].some((c) => this.pressedBuffer.has(c));
  }

  /** True on the first sim tick after the action was released (e.g. beam release). */
  wasReleased(action: Action): boolean {
    return this.bindings[action].some((c) => this.releasedBuffer.has(c));
  }

  /** Call once at the end of every fixed simulation tick. */
  endTick(): void {
    this.pressedBuffer.clear();
    this.releasedBuffer.clear();
  }

  /** Which action (if any) a raw code maps to; used for render-rate shortcuts like F1. */
  actionFor(code: string): Action | undefined {
    for (const [action, codes] of Object.entries(this.bindings) as [Action, readonly string[]][]) {
      if (codes.includes(code)) return action;
    }
    return undefined;
  }
}
