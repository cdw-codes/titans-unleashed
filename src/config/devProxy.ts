/**
 * Milestone-1 stand-in for the kaiju: a scale pillar you can walk around to
 * judge fog, shadows and the loop. Replaced by the real kaiju in Milestone 2.
 */
export const DEV_PROXY = {
  height: 80,
  radius: 12,
  walkSpeed: 10,
  sprintSpeed: 20,
  /** Seconds-ish to reach target speed (exponential smoothing time constant). */
  acceleration: 0.6,
} as const;
