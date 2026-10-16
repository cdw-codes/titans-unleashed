import { FixedStepper, type StepResult } from './FixedStepper';
import { SIM } from '../config/sim';

export interface LoopCallbacks {
  /** Fixed-rate simulation tick (physics + gameplay). */
  fixedUpdate(dt: number): void;
  /** Once per display frame. `alpha` interpolates between the last two sim states. */
  render(alpha: number, frameDelta: number, step: StepResult): void;
}

/** requestAnimationFrame driver around FixedStepper. Pausing stops the sim but keeps rendering. */
export class GameLoop {
  readonly stepper = new FixedStepper(SIM.tickRate, SIM.maxStepsPerFrame, SIM.maxFrameDelta);
  paused = false;
  timeScale = 1;
  private last = 0;
  private handle = 0;
  /** Min ms between rendered frames; 0 = every display refresh. */
  private readonly minFrameMs = SIM.renderFpsCap > 0 ? 1000 / SIM.renderFpsCap : 0;

  constructor(private readonly cb: LoopCallbacks) {}

  start(): void {
    this.last = performance.now();
    this.handle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.handle);
  }

  private readonly frame = (now: number): void => {
    this.handle = requestAnimationFrame(this.frame);
    const elapsed = now - this.last;
    // FPS cap: skip display refreshes until the frame budget is used. 1 ms of slack
    // keeps a 60 Hz display at a steady 30 instead of dropping to 20.
    if (this.minFrameMs > 0 && elapsed < this.minFrameMs - 1) return;
    const frameDelta = elapsed / 1000;
    this.last = now;

    const step = this.stepper.advance(this.paused ? 0 : frameDelta * this.timeScale);
    for (let i = 0; i < step.steps; i++) this.cb.fixedUpdate(this.stepper.dt);
    this.cb.render(step.alpha, frameDelta, step);
  };
}
