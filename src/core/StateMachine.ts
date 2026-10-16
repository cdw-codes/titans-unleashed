export interface StateHandlers<S extends string, C> {
  enter?(ctx: C, from: S | null): void;
  /** Return a state to transition to, or nothing to stay. */
  update?(ctx: C, dt: number, timeInState: number): S | void;
  exit?(ctx: C, to: S): void;
}

/** Explicit finite state machine. States are string literals; handlers are optional per state. */
export class StateMachine<S extends string, C> {
  private _state: S;
  private _time = 0;

  constructor(
    initial: S,
    private readonly handlers: Partial<Record<S, StateHandlers<S, C>>>,
    private readonly ctx: C,
  ) {
    this._state = initial;
    handlers[initial]?.enter?.(ctx, null);
  }

  get state(): S {
    return this._state;
  }

  get timeInState(): number {
    return this._time;
  }

  is(...states: S[]): boolean {
    return states.includes(this._state);
  }

  transition(to: S): void {
    if (to === this._state) return;
    const from = this._state;
    this.handlers[from]?.exit?.(this.ctx, to);
    this._state = to;
    this._time = 0;
    this.handlers[to]?.enter?.(this.ctx, from);
  }

  update(dt: number): void {
    this._time += dt;
    const next = this.handlers[this._state]?.update?.(this.ctx, dt, this._time);
    if (next) this.transition(next);
  }
}
