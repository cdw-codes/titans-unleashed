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
  /** Ring of dust pouring out at the base of a collapsing building (repeats while it falls). */
  readonly collapse: DustBurstConfig;
  /** Puff when something small is crushed. */
  readonly crush: DustBurstConfig;
  /** Seconds between collapse dust rings. */
  readonly collapseInterval: number;
  /** Cap on burst scale from building footprint: huge puffs cost fill-rate (overdraw). */
  readonly maxBurstScale: number;
}

export interface SmokeConfig {
  readonly capacity: number;
  readonly color: number;
  readonly drag: number;
  readonly plume: DustBurstConfig;
  /** Seconds a wreck keeps smoking, and seconds between plume puffs. */
  readonly duration: number;
  readonly interval: number;
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
  collapse: {
    count: 10,
    ringRadius: 10,
    speedMin: 6,
    speedMax: 14,
    riseMin: 2,
    riseMax: 7,
    sizeStart: 14,
    sizeEnd: 45,
    lifeMin: 3,
    lifeMax: 5,
    opacity: 0.85,
  },
  crush: {
    count: 5,
    ringRadius: 3,
    speedMin: 3,
    speedMax: 8,
    riseMin: 1,
    riseMax: 4,
    sizeStart: 6,
    sizeEnd: 18,
    lifeMin: 1.5,
    lifeMax: 2.5,
    opacity: 0.7,
  },
  collapseInterval: 0.3,
  maxBurstScale: 2.5,
};

export const SMOKE: SmokeConfig = {
  capacity: 300,
  color: 0x4f4b47,
  drag: 0.6,
  plume: {
    count: 2,
    ringRadius: 6,
    speedMin: 0.5,
    speedMax: 2,
    riseMin: 8,
    riseMax: 14,
    sizeStart: 14,
    sizeEnd: 55,
    lifeMin: 5,
    lifeMax: 8,
    opacity: 0.55,
  },
  duration: 10,
  interval: 0.6,
};
