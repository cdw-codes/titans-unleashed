export interface CameraConfig {
  readonly fov: number;
  readonly near: number;
  /** Orbit distance (m) behind the follow target. */
  readonly distance: number;
  /** Height (m) on the target the camera looks at. */
  readonly targetHeight: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly initialPitch: number;
}

export const CAMERA: CameraConfig = {
  fov: 55,
  near: 1,
  distance: 170,
  targetHeight: 55,
  minPitch: -0.35,
  maxPitch: 1.2,
  initialPitch: 0.18,
};
