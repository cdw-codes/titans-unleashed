/** Simulation timing and world-scale constants. Units: meters, seconds. */
export interface SimConfig {
  /** Fixed simulation rate for physics and gameplay. */
  readonly tickRate: number;
  /** Max fixed steps per rendered frame before dropping time (prevents the spiral of death). */
  readonly maxStepsPerFrame: number;
  /** Real frame delta is clamped to this before accumulating (tab switches, breakpoints). */
  readonly maxFrameDelta: number;
  readonly gravity: number;
  /**
   * Max rendered frames per second (0 = uncapped, follow the display).
   * Lowers GPU/CPU load and heat; does not change memory use. The sim stays at tickRate.
   */
  readonly renderFpsCap: number;
}

export const SIM: SimConfig = {
  tickRate: 60,
  maxStepsPerFrame: 5,
  maxFrameDelta: 0.25,
  gravity: -9.81,
  renderFpsCap: 30,
};
