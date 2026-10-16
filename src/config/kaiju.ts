/** Player kaiju movement, gait and collision. Units: m, s, rad. */
export interface KaijuMovementConfig {
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  /** m/s² while speeding up. Low = ponderous start. */
  readonly acceleration: number;
  readonly sprintAcceleration: number;
  /** m/s² while slowing down. Low = momentum carries the body on. */
  readonly deceleration: number;
  /** Max body turn rate (rad/s) when walking / sprinting. */
  readonly turnRate: number;
  readonly sprintTurnRate: number;
  /** 0..1: how much speed is withheld while the body faces away from the wished direction. */
  readonly turnSlowdown: number;
  /** Below this speed (m/s) the kaiju counts as standing. */
  readonly idleSpeed: number;
}

export interface KaijuGaitConfig {
  /** Distance (m) covered by one full gait cycle (= two footsteps). */
  readonly walkStride: number;
  readonly sprintStride: number;
  /** Meters of "virtual travel" per radian turned on the spot (feet shuffle when pivoting). */
  readonly pivotStride: number;
  /** Min gait speed (cycles/s) used to finish a step after stopping, so a foot always comes down. */
  readonly settleRate: number;
}

export interface KaijuBodyConfig {
  /** Approximate standing height to top of head (m). */
  readonly height: number;
  readonly capsuleRadius: number;
  /** Half the straight section of the capsule. Total height = 2 * (halfHeight + radius). */
  readonly capsuleHalfHeight: number;
  /** Lateral distance (m) from body center to each foot. */
  readonly footSpread: number;
}

export interface KaijuControllerConfig {
  /** Rapier KCC skin offset (m). */
  readonly offset: number;
  readonly maxSlopeClimbDeg: number;
  readonly minSlopeSlideDeg: number;
  readonly autostepHeight: number;
  readonly autostepMinWidth: number;
  readonly snapToGround: number;
  readonly gravityScale: number;
}

export interface KaijuFeedbackConfig {
  /** Camera trauma (0..1) added by the player's own footstep. */
  readonly walkStepTrauma: number;
  readonly sprintStepTrauma: number;
  /** Downward camera kick (m/s impulse) per footstep. */
  readonly walkStepKick: number;
  readonly sprintStepKick: number;
}

export const KAIJU_MOVEMENT: KaijuMovementConfig = {
  walkSpeed: 9,
  sprintSpeed: 17,
  acceleration: 3.5,
  sprintAcceleration: 2.2,
  deceleration: 6,
  turnRate: 1.1,
  sprintTurnRate: 0.6,
  turnSlowdown: 0.85,
  idleSpeed: 0.4,
};

export const KAIJU_GAIT: KaijuGaitConfig = {
  walkStride: 34,
  sprintStride: 48,
  pivotStride: 14,
  settleRate: 0.35,
};

export const KAIJU_BODY: KaijuBodyConfig = {
  height: 80,
  capsuleRadius: 13,
  capsuleHalfHeight: 24,
  footSpread: 9,
};

export const KAIJU_CONTROLLER: KaijuControllerConfig = {
  offset: 0.5,
  maxSlopeClimbDeg: 40,
  minSlopeSlideDeg: 50,
  autostepHeight: 4,
  autostepMinWidth: 2,
  snapToGround: 3,
  gravityScale: 2,
};

export const KAIJU_FEEDBACK: KaijuFeedbackConfig = {
  walkStepTrauma: 0.28,
  sprintStepTrauma: 0.4,
  walkStepKick: 9,
  sprintStepKick: 14,
};
