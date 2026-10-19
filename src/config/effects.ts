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

export interface FireConfig {
  readonly capacity: number;
  readonly color: number;
  readonly drag: number;
  readonly additive: boolean;
  readonly brightness: number;
  /** Burst at the beam impact point, repeated every `interval` seconds while firing. */
  readonly beamImpact: DustBurstConfig;
  readonly interval: number;
}

export interface ShockwaveConfig {
  /** Seconds for a ring to expand to its full radius. */
  readonly duration: number;
  readonly stompColor: number;
  readonly stompOpacity: number;
  readonly roarColor: number;
  readonly roarOpacity: number;
  /** Roar ring radius (m); visual only (stun radius is in combat config). */
  readonly roarRadius: number;
  readonly pulseColor: number;
  readonly pulseOpacity: number;
}

export interface BeamVisualConfig {
  /** Radii (m, at titan scale 1) of the hot core and the soft outer sheath. */
  readonly coreRadius: number;
  readonly glowRadius: number;
  /** Mouth flare size (m) when idle-charged and at full charge. */
  readonly mouthFlareMin: number;
  readonly mouthFlareMax: number;
  readonly impactFlareSize: number;
}

export const BEAM_VISUAL: BeamVisualConfig = {
  coreRadius: 3.5,
  glowRadius: 11,
  mouthFlareMin: 6,
  mouthFlareMax: 32,
  impactFlareSize: 70,
};

export const FIRE: FireConfig = {
  capacity: 300,
  color: 0xff8a3a,
  drag: 0.5,
  additive: true,
  brightness: 3,
  beamImpact: {
    count: 6,
    ringRadius: 3,
    speedMin: 8,
    speedMax: 22,
    riseMin: 6,
    riseMax: 16,
    sizeStart: 8,
    sizeEnd: 30,
    lifeMin: 0.45,
    lifeMax: 0.9,
    opacity: 0.9,
  },
  interval: 0.06,
};

/** Glowing trail puffs behind plasma projectiles (additive). */
export const PLASMA_TRAIL = {
  capacity: 400,
  color: 0xc77dff,
  drag: 0.3,
  additive: true,
  brightness: 2.5,
  puff: {
    count: 1,
    ringRadius: 0,
    speedMin: 0,
    speedMax: 2,
    riseMin: 0,
    riseMax: 2,
    sizeStart: 9,
    sizeEnd: 3,
    lifeMin: 0.35,
    lifeMax: 0.5,
    opacity: 0.8,
  },
};

export const SHOCKWAVE: ShockwaveConfig = {
  duration: 0.7,
  stompColor: 0xc9bca3,
  stompOpacity: 0.55,
  roarColor: 0xcfe9ff,
  roarOpacity: 0.35,
  roarRadius: 400,
  pulseColor: 0x8ff1ff,
  pulseOpacity: 0.85,
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

export interface WaterFxConfig {
  /** Water shallower than this (m) at a foot or the body counts as dry ground. */
  readonly minDepth: number;
  /** Spray: droplets thrown up and falling back (real gravity reads as heavy at titan scale). */
  readonly sprayCapacity: number;
  readonly sprayColor: number;
  readonly sprayDrag: number;
  readonly sprayGravity: number;
  /** Mist: fine drifting haze around splashes and beam steam. */
  readonly mistCapacity: number;
  readonly mistColor: number;
  readonly mistDrag: number;
  readonly stepSpray: DustBurstConfig;
  readonly stepMist: DustBurstConfig;
  /** Stomp / pulse / tail / knockdown into water. */
  readonly slamSpray: DustBurstConfig;
  readonly slamMist: DustBurstConfig;
  /** Bow wave thrown ahead of a wading titan (per wake tick, scaled by speed). */
  readonly bowSpray: DustBurstConfig;
  /** Steam where a beam crosses the water (per steam tick). */
  readonly steam: DustBurstConfig;
  readonly steamInterval: number;
  /** Foam rings on the surface: pool size, color, opacity. */
  readonly rippleCapacity: number;
  readonly rippleColor: number;
  readonly rippleOpacity: number;
  /** Ring radius (m, before titan scale) and seconds to expand, per source. */
  readonly stepRipple: number;
  readonly stepRippleSeconds: number;
  readonly slamRippleScale: number;
  readonly slamRippleSeconds: number;
  /** Wake: rings left behind a wading titan, every this many seconds while moving. */
  readonly wakeInterval: number;
  readonly wakeRipple: number;
  readonly wakeRippleSeconds: number;
  /** Foam collar at the waterline around a wading body (radius = capsule radius x this). */
  readonly collarInterval: number;
  readonly collarScale: number;
  readonly collarSeconds: number;
  /** Water surface: base opacity looking straight down (grazing angles turn opaque), fresnel strength. */
  readonly surfaceOpacity: number;
  readonly fresnel: number;
}

export const WATER_FX: WaterFxConfig = {
  minDepth: 1.5,
  sprayCapacity: 700,
  sprayColor: 0xeef6f8,
  sprayDrag: 0.55,
  sprayGravity: 9.8,
  mistCapacity: 260,
  mistColor: 0xdfeaee,
  mistDrag: 0.3,
  stepSpray: {
    count: 14,
    ringRadius: 6,
    speedMin: 4,
    speedMax: 11,
    riseMin: 12,
    riseMax: 26,
    sizeStart: 7,
    sizeEnd: 16,
    lifeMin: 2,
    lifeMax: 3.2,
    opacity: 0.85,
  },
  stepMist: {
    count: 5,
    ringRadius: 8,
    speedMin: 3,
    speedMax: 8,
    riseMin: 2,
    riseMax: 6,
    sizeStart: 18,
    sizeEnd: 50,
    lifeMin: 2.5,
    lifeMax: 4,
    opacity: 0.35,
  },
  slamSpray: {
    count: 40,
    ringRadius: 18,
    speedMin: 8,
    speedMax: 24,
    riseMin: 24,
    riseMax: 48,
    sizeStart: 10,
    sizeEnd: 26,
    lifeMin: 3,
    lifeMax: 5,
    opacity: 0.9,
  },
  slamMist: {
    count: 14,
    ringRadius: 22,
    speedMin: 6,
    speedMax: 16,
    riseMin: 3,
    riseMax: 10,
    sizeStart: 30,
    sizeEnd: 90,
    lifeMin: 3.5,
    lifeMax: 6,
    opacity: 0.4,
  },
  bowSpray: {
    count: 3,
    ringRadius: 4,
    speedMin: 3,
    speedMax: 8,
    riseMin: 5,
    riseMax: 12,
    sizeStart: 6,
    sizeEnd: 14,
    lifeMin: 1.4,
    lifeMax: 2.2,
    opacity: 0.75,
  },
  steam: {
    count: 2,
    ringRadius: 6,
    speedMin: 1,
    speedMax: 4,
    riseMin: 10,
    riseMax: 20,
    sizeStart: 16,
    sizeEnd: 60,
    lifeMin: 2.5,
    lifeMax: 4,
    opacity: 0.5,
  },
  steamInterval: 0.08,
  rippleCapacity: 120,
  rippleColor: 0xf4fbff,
  rippleOpacity: 0.75,
  stepRipple: 34,
  stepRippleSeconds: 2.4,
  slamRippleScale: 1.6,
  slamRippleSeconds: 3.2,
  wakeInterval: 0.35,
  wakeRipple: 30,
  wakeRippleSeconds: 3,
  collarInterval: 0.5,
  collarScale: 1.6,
  collarSeconds: 1.8,
  surfaceOpacity: 0.8,
  fresnel: 0.35,
};
