export interface CameraConfig {
  readonly fov: number;
  /** Extra FOV (deg) at full sprint: sells speed without making the kaiju feel smaller. */
  readonly sprintFovBoost: number;
  readonly near: number;
  /** Orbit distance (m) from the pivot. */
  readonly distance: number;
  /** Closest the camera may be pulled in by collision (m). */
  readonly minDistance: number;
  /** Pivot height above the kaiju's feet (m). */
  readonly pivotHeight: number;
  /** Pivot shift to the camera's right (m) so the kaiju doesn't cover the crosshair. */
  readonly shoulderOffset: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly initialPitch: number;
  /** Follow lag half-lives (s). Larger = heavier, more trailing camera. */
  readonly followHalfLife: number;
  readonly followHalfLifeY: number;
  /** Collision probe sphere radius (m) and gap kept from surfaces. */
  readonly collisionRadius: number;
  readonly collisionMargin: number;
  /** How fast the camera pulls in on collision vs eases back out (half-lives, s). */
  readonly pullInHalfLife: number;
  readonly easeOutHalfLife: number;
  /** Never go below this height above the ground (m). */
  readonly groundClearance: number;
}

export interface ShakeConfig {
  /** Max positional offset (m) at trauma 1. */
  readonly maxOffset: number;
  /** Max roll (rad) at trauma 1. */
  readonly maxRoll: number;
  /** Max look jitter (rad) at trauma 1. */
  readonly maxAngle: number;
  /** Noise frequency (Hz). Low = rolling quake, high = rattle. */
  readonly frequency: number;
  /** Trauma lost per second. */
  readonly decay: number;
  /** Footstep camera kick: spring frequency (Hz) and damping ratio. */
  readonly kickFrequency: number;
  readonly kickDamping: number;
}

export const CAMERA: CameraConfig = {
  fov: 55,
  sprintFovBoost: 5,
  near: 1,
  distance: 205,
  minDistance: 30,
  pivotHeight: 88,
  shoulderOffset: 22,
  minPitch: -0.3,
  maxPitch: 1.2,
  initialPitch: 0.16,
  followHalfLife: 0.18,
  followHalfLifeY: 0.35,
  collisionRadius: 6,
  collisionMargin: 3,
  pullInHalfLife: 0.04,
  easeOutHalfLife: 0.6,
  groundClearance: 4,
};

export const SHAKE: ShakeConfig = {
  maxOffset: 3.2,
  maxRoll: 0.035,
  maxAngle: 0.012,
  frequency: 9,
  decay: 1.4,
  kickFrequency: 2.2,
  kickDamping: 0.45,
};
