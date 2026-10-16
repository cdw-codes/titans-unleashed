import type { KaijuGaitConfig } from '../../config/kaiju';

export type Foot = 'left' | 'right';

/**
 * Gait phase in [0, 1): left foot plants at 0, right at 0.5.
 * Driven by distance travelled (plus turning), so steps stay in sync with
 * ground speed and never slide. Reports a footstep each time a plant is crossed.
 */
export class Gait {
  phase = 0;
  /** Phase before the last update, for render interpolation. */
  prevPhase = 0;

  constructor(private readonly cfg: KaijuGaitConfig) {}

  /** Returns the foot that planted this tick, if any. */
  update(distance: number, turnAngle: number, sprinting: boolean, dt: number): Foot | null {
    const c = this.cfg;
    const stride = sprinting ? c.sprintStride : c.walkStride;
    const travel = distance + Math.abs(turnAngle) * c.pivotStride;
    let advance = travel / stride;

    // Stopped mid-step: keep going until the raised foot comes down.
    const settling = travel < 1e-3 && !this.isPlanted();
    if (settling) advance = c.settleRate * dt;
    if (advance <= 0) {
      this.prevPhase = this.phase;
      return null;
    }

    const before = this.phase;
    this.prevPhase = before;
    let after = before + advance;
    let foot: Foot | null = null;

    if (before < 0.5 && after >= 0.5) foot = 'right';
    if (after >= 1) foot = 'left';
    // If a plant was crossed while settling, stop exactly on it.
    if (foot && settling) after = foot === 'right' ? 0.5 : 1;

    this.phase = after % 1;
    return foot;
  }

  isPlanted(): boolean {
    return this.phase === 0 || this.phase === 0.5;
  }
}
