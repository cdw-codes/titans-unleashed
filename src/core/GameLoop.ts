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
    const frameDelta = (now - this.last) / 1000;
    this.last = now;

    const step = this.stepper.advance(this.paused ? 0 : frameDelta * this.timeScale);
    for (let i = 0; i < step.steps; i++) this.cb.fixedUpdate(this.stepper.dt);
    this.cb.render(step.alpha, frameDelta, step);
  };
}
