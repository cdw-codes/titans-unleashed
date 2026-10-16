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
  /** Strafing (facing a locked target): speed factor when moving sideways / backwards. */
  readonly strafeSpeedFactor: number;
  readonly backpedalSpeedFactor: number;
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
  /** Standing height to top of head (m). The model is scaled to match. */
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
  walkSpeed: 13,
  sprintSpeed: 40,
  acceleration: 15,
  sprintAcceleration: 3.2,
  deceleration: 7,
  turnRate: 1.35,
  sprintTurnRate: 0.75,
  turnSlowdown: 0.85,
  idleSpeed: 0.4,
  strafeSpeedFactor: 0.65,
  backpedalSpeedFactor: 0.5,
};

export const KAIJU_GAIT: KaijuGaitConfig = {
  walkStride: 46,
  sprintStride: 64,
  pivotStride: 18,
  settleRate: 0.35,
};

export const KAIJU_BODY: KaijuBodyConfig = {
  height: 100,
  capsuleRadius: 16,
  capsuleHalfHeight: 30,
  footSpread: 11,
};

export const KAIJU_CONTROLLER: KaijuControllerConfig = {
  offset: 0.5,
  maxSlopeClimbDeg: 40,
  minSlopeSlideDeg: 50,
  autostepHeight: 5,
  autostepMinWidth: 2,
  snapToGround: 4,
  gravityScale: 2,
};

export const KAIJU_FEEDBACK: KaijuFeedbackConfig = {
  walkStepTrauma: 0.28,
  sprintStepTrauma: 0.4,
  walkStepKick: 9,
  sprintStepKick: 14,
};
