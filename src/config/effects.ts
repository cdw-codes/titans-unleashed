export interface DustBurstConfig {
  /** Puffs per burst. */
  readonly count: number;
  /** Start radius (m) of the ring the puffs spawn on. */
  readonly ringRadius: number;
  /** Outward speed range (m/s). */
  readonly speedMin: number;
  readonly speedMax: number;
  /** Upward speed range (m/s). */
  readonly riseMin: number;
  readonly riseMax: number;
  /** Start and end billboard size (m). */
  readonly sizeStart: number;
  readonly sizeEnd: number;
  readonly lifeMin: number;
  readonly lifeMax: number;
  readonly opacity: number;
}

export interface DustConfig {
  /** Pool size: max live puffs. Oldest are recycled when full. */
  readonly capacity: number;
  readonly color: number;
  /** Fraction of velocity kept per second (air drag). */
  readonly drag: number;
  readonly walkStep: DustBurstConfig;
  readonly sprintStep: DustBurstConfig;
}

export const DUST: DustConfig = {
  capacity: 600,
  color: 0x9d927d,
  drag: 0.25,
  walkStep: {
    count: 12,
    ringRadius: 7,
    speedMin: 7,
    speedMax: 15,
    riseMin: 1,
    riseMax: 4,
    sizeStart: 12,
    sizeEnd: 42,
    lifeMin: 2.4,
    lifeMax: 3.8,
    opacity: 0.8,
  },
  sprintStep: {
    count: 18,
    ringRadius: 8,
    speedMin: 10,
    speedMax: 22,
    riseMin: 2,
    riseMax: 6,
    sizeStart: 14,
    sizeEnd: 52,
    lifeMin: 2.8,
    lifeMax: 4.4,
    opacity: 0.9,
  },
};
