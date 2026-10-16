import type { ThreatConfig } from '../../config/military';

/**
 * Heat from player destruction → threat level 0..5. Heat cools after a calm
 * period, so laying low makes the military back off. Pure logic.
 */
export class Threat {
  heat = 0;
  private calm = 0;

  constructor(private readonly cfg: ThreatConfig) {}

  get level(): number {
    let l = 0;
    for (const t of this.cfg.levelThresholds) if (this.heat >= t) l++;
    return l;
  }

  /** Heat progress toward the next level (0..1), for HUD. */
  get progress(): number {
    const th = this.cfg.levelThresholds;
    const l = this.level;
    if (l >= th.length) return 1;
    const lo = l === 0 ? 0 : th[l - 1]!;
    return (this.heat - lo) / (th[l]! - lo);
  }

  addDestruction(points: number): void {
    this.heat = Math.min(this.cfg.maxHeat, this.heat + points);
    this.calm = 0;
  }

  update(dt: number): void {
    this.calm += dt;
    if (this.calm < this.cfg.calmDelay) return;
    this.heat = Math.max(0, this.heat - (this.heat * this.cfg.decayFraction + this.cfg.decayFlat) * dt);
  }
}
