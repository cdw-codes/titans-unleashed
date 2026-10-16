export interface StepResult {
  /** Number of fixed steps to run this frame. */
  steps: number;
  /** Interpolation factor in [0, 1) between the previous and current sim state. */
  alpha: number;
  /** Seconds of simulation time discarded because the step budget was exceeded. */
  dropped: number;
}

/**
 * Fixed-timestep accumulator. Pure logic: feed it real frame deltas, it tells
 * you how many fixed steps to run and how far to interpolate for rendering.
 */
export class FixedStepper {
  readonly dt: number;
  private accumulator = 0;
  private readonly result: StepResult = { steps: 0, alpha: 0, dropped: 0 };

  constructor(
    tickRate: number,
    private readonly maxSteps: number,
    private readonly maxFrameDelta: number,
  ) {
    if (tickRate <= 0 || maxSteps < 1) throw new Error('Invalid FixedStepper config');
    this.dt = 1 / tickRate;
  }

  /** Returns a reused result object; read it before the next call. */
  advance(frameDelta: number): StepResult {
    const delta = Math.min(Math.max(frameDelta, 0), this.maxFrameDelta);
    this.accumulator += delta;

    let steps = Math.floor(this.accumulator / this.dt);
    let dropped = 0;
    if (steps > this.maxSteps) {
      dropped = (steps - this.maxSteps) * this.dt;
      steps = this.maxSteps;
    }
    this.accumulator -= (steps * this.dt) + dropped;
    // Guard against float drift pushing the remainder to ~dt.
    if (this.accumulator >= this.dt) this.accumulator = this.dt - 1e-9;

    this.result.steps = steps;
    this.result.alpha = this.accumulator / this.dt;
    this.result.dropped = dropped;
    return this.result;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
