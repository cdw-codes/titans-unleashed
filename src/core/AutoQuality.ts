export interface AutoQualityConfig {
  /** Frame interval (ms) we must stay under (the FPS cap's interval plus slack). */
  readonly budgetMs: number;
  /** Seconds of play sampled per verdict. */
  readonly windowSeconds: number;
  /** Fraction of frames allowed over budget before stepping down. */
  readonly overBudgetFraction: number;
  /** Ignore the first seconds after a change (shader compiles, streaming). */
  readonly settleSeconds: number;
}

/**
 * Watches real frame intervals during play and asks for a lower preset when
 * the frame budget is missed too often. Steps down only (no oscillation).
 * Pure logic: feed it frame times, it answers yes/no.
 */
export class AutoQuality {
  private samples: number[] = [];
  private elapsed = 0;
  private settle: number;

  constructor(private readonly cfg: AutoQualityConfig) {
    this.settle = cfg.settleSeconds;
  }

  /** Feed one frame interval (ms). Returns true when quality should drop one step. */
  sample(frameMs: number): boolean {
    const dt = frameMs / 1000;
    if (this.settle > 0) {
      this.settle -= dt;
      return false;
    }
    // Pauses / tab switches show up as huge gaps: not a performance signal.
    if (frameMs > 500) return false;
    this.samples.push(frameMs);
    this.elapsed += dt;
    if (this.elapsed < this.cfg.windowSeconds) return false;
    const over = this.samples.filter((s) => s > this.cfg.budgetMs).length / this.samples.length;
    this.samples = [];
    this.elapsed = 0;
    if (over > this.cfg.overBudgetFraction) {
      this.settle = this.cfg.settleSeconds;
      return true;
    }
    return false;
  }

  /** After any external change (quality switch, loading), wait before judging again. */
  reset(): void {
    this.samples = [];
    this.elapsed = 0;
    this.settle = this.cfg.settleSeconds;
  }
}
