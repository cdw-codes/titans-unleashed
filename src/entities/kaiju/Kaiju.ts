import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { KAIJU_BODY, KAIJU_CONTROLLER, KAIJU_GAIT, KAIJU_MOVEMENT } from '../../config/kaiju';
import { SIM } from '../../config/sim';
import { StateMachine } from '../../core/StateMachine';
import { wrapAngle } from '../../core/math';
import type { GameEventBus } from '../../core/events';
import type { PhysicsSystem } from '../../systems/PhysicsSystem';
import { Gait } from './Gait';
import { KaijuModel, MODEL_DESIGN_HEIGHT } from './KaijuModel';
import { KaijuMotor, type MoveIntent } from './KaijuMotor';
import { locomotionState, type KaijuState } from './locomotion';

const _desired = { x: 0, y: 0, z: 0 };

/**
 * A kaiju body: motor + gait + state machine in the fixed tick, Rapier
 * kinematic character controller for collision, procedural model at render rate.
 * Controlled through MoveIntent, so rivals can reuse it with an AI controller.
 */
export class Kaiju {
  readonly model = new KaijuModel();
  readonly motor = new KaijuMotor(KAIJU_MOVEMENT);
  readonly gait = new Gait(KAIJU_GAIT);
  readonly fsm: StateMachine<KaijuState, Kaiju>;
  /** Feet position (sim). */
  readonly position = new THREE.Vector3();
  readonly renderPosition = new THREE.Vector3();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;

  private readonly prevPosition = new THREE.Vector3();
  private prevYaw = 0;
  private verticalVelocity = 0;
  private grounded = false;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly centerOffset: number;
  private time = 0;
  /** Model scale relative to its design height; also scales foot offsets and dust. */
  readonly scale = KAIJU_BODY.height / MODEL_DESIGN_HEIGHT;

  constructor(
    private readonly physics: PhysicsSystem,
    private readonly events: GameEventBus,
    spawn: THREE.Vector3,
    readonly isPlayer: boolean,
  ) {
    const { capsuleHalfHeight: hh, capsuleRadius: r } = KAIJU_BODY;
    this.centerOffset = hh + r;
    this.position.copy(spawn);
    this.prevPosition.copy(spawn);

    const world = physics.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + this.centerOffset, spawn.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(hh, r), this.body);

    const c = KAIJU_CONTROLLER;
    this.controller = world.createCharacterController(c.offset);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(c.maxSlopeClimbDeg));
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(c.minSlopeSlideDeg));
    this.controller.enableAutostep(c.autostepHeight, c.autostepMinWidth, false);
    this.controller.enableSnapToGround(c.snapToGround);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(50000);

    this.model.object.scale.setScalar(this.scale);
    this.fsm = new StateMachine<KaijuState, Kaiju>('idle', {}, this);
  }

  get state(): KaijuState {
    return this.fsm.state;
  }

  get yaw(): number {
    return this.motor.yaw;
  }

  fixedUpdate(dt: number, intent: MoveIntent): void {
    this.prevPosition.copy(this.position);
    this.prevYaw = this.motor.yaw;
    this.time += dt;

    this.motor.update(intent, dt);

    // Gravity only while airborne. Pushing down while grounded makes Rapier's KCC
    // stall horizontally; snap-to-ground keeps us glued on the way down instead.
    this.verticalVelocity = this.grounded ? 0 : this.verticalVelocity + SIM.gravity * KAIJU_CONTROLLER.gravityScale * dt;
    _desired.x = this.motor.velocityX * dt;
    _desired.y = this.verticalVelocity * dt;
    _desired.z = this.motor.velocityZ * dt;

    this.controller.computeColliderMovement(this.collider, _desired);
    const moved = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    this.position.x += moved.x;
    this.position.y += moved.y;
    this.position.z += moved.z;
    this.body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y + this.centerOffset,
      z: this.position.z,
    });

    // Blocked by a wall: bleed momentum so we don't stay "running" in place.
    const travelled = Math.hypot(moved.x, moved.z);
    if (dt > 0) this.motor.speed = Math.min(this.motor.speed, travelled / dt + 1);

    const turned = wrapAngle(this.motor.yaw - this.prevYaw);
    const foot = this.gait.update(travelled, turned, this.motor.sprinting, dt);
    if (foot) this.emitFootstep(foot);

    if (this.fsm.is('idle', 'walk', 'sprint')) {
      this.fsm.transition(locomotionState(this.motor.speed, this.motor.sprinting, KAIJU_MOVEMENT));
    }
    this.fsm.update(dt);
  }

  render(alpha: number, frameDt: number): void {
    this.renderPosition.lerpVectors(this.prevPosition, this.position, alpha);
    const yaw = this.prevYaw + wrapAngle(this.motor.yaw - this.prevYaw) * alpha;
    this.model.object.position.copy(this.renderPosition);
    this.model.object.rotation.y = yaw;

    let p0 = this.gait.prevPhase;
    const p1 = this.gait.phase;
    if (p1 < p0) p0 -= 1;
    const phase = (p0 + (p1 - p0) * alpha + 1) % 1;
    const sprinting = this.motor.sprinting;
    const stride = sprinting ? KAIJU_GAIT.sprintStride : KAIJU_GAIT.walkStride;

    this.model.pose({
      phase,
      speedRatio: this.motor.speed / KAIJU_MOVEMENT.walkSpeed,
      stepping: !this.gait.isPlanted() || this.motor.speed > KAIJU_MOVEMENT.idleSpeed,
      sprinting: sprinting && this.motor.speed > KAIJU_MOVEMENT.walkSpeed,
      turnVelocity: this.motor.turnVelocity,
      strideAngle: Math.asin(Math.min(0.8, stride / 4 / (this.model.legLength * this.scale))),
      time: this.time,
      dt: frameDt,
    });
  }

  private emitFootstep(foot: 'left' | 'right'): void {
    const side = foot === 'left' ? 1 : -1;
    const stride = this.motor.sprinting ? KAIJU_GAIT.sprintStride : KAIJU_GAIT.walkStride;
    const lx = KAIJU_BODY.footSpread * side;
    const footCenter = 4.5 * this.scale;
    const lz = this.motor.speed > KAIJU_MOVEMENT.idleSpeed ? stride / 4 + footCenter : footCenter;
    const s = Math.sin(this.motor.yaw);
    const c = Math.cos(this.motor.yaw);
    this.events.emit('kaiju:footstep', {
      x: this.position.x + lx * c + lz * s,
      y: this.position.y,
      z: this.position.z - lx * s + lz * c,
      foot,
      sprinting: this.motor.sprinting,
      isPlayer: this.isPlayer,
      scale: this.scale,
    });
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }
}
