import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TITAN_CONTROLLER } from '../../config/titan';
import { SIM } from '../../config/sim';
import { StateMachine } from '../../core/StateMachine';
import { damp, wrapAngle } from '../../core/math';
import type { GameEventBus } from '../../core/events';
import { ALL_GROUPS, collisionGroups, GROUP, type PhysicsSystem } from '../../systems/PhysicsSystem';
import { constrainToCircle } from '../../systems/encounters/EncounterSystem';
import { Gait } from './Gait';
import { TitanModel, MODEL_DESIGN_HEIGHT, MOUTH_DESIGN } from './TitanModel';
import { TitanCombat, type CombatInput, type EnergyPool } from './TitanCombat';
import { TitanMotor, type MoveIntent } from './TitanMotor';
import { locomotionState, type TitanState } from './locomotion';
import type { TitanSpec } from './TitanSpec';
import type { TitanModifiers } from '../../systems/progression/Upgrades';
import { terrain } from '../../world/terrain/Terrain';

const _desired = { x: 0, y: 0, z: 0 };
const _scaledIntent: MoveIntent = { x: 0, z: 0, sprint: false };
const NO_COMBAT: CombatInput = { claw: false, tail: false, stomp: false, roar: false, beamHeld: false, aim: null };

/**
 * A titan body: motor + gait + state machine in the fixed tick, Rapier
 * kinematic character controller for collision, procedural model at render rate.
 * Controlled through MoveIntent, so rivals can reuse it with an AI controller.
 */
export class Titan {
  readonly model: TitanModel;
  readonly motor: TitanMotor;
  readonly gait: Gait;
  readonly fsm: StateMachine<TitanState, Titan>;
  readonly combat: TitanCombat;
  /** Feet position (sim). */
  readonly position = new THREE.Vector3();
  readonly renderPosition = new THREE.Vector3();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;

  /** Collider handles the body pushed against this tick (static structures). */
  readonly contacts: number[] = [];
  /** Forward speed before wall contact bled it off this tick (for impact damage). */
  impactSpeed = 0;
  private readonly prevPosition = new THREE.Vector3();
  private prevYaw = 0;
  private verticalVelocity = 0;
  /** How strongly the feet adapt to the ground (fades out while lying down). */
  private plantWeight = 1;
  private grounded = false;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly centerOffset: number;
  private time = 0;
  /** Model scale relative to its design height; also scales foot offsets and dust. */
  readonly scale: number;
  /**
   * Rivals don't collide with buildings (no pathfinding needed): they plow
   * through, wrecking whatever they overlap (see DestructionSystem).
   */
  readonly plowsThrough: boolean;
  /** Visual sink below the ground (m), for despawn animations. */
  sink = 0;
  /** Multiplies ground covered per tick (rivals crossing the fogged distance faster). */
  travelMultiplier = 1;
  private readonly kccGroups: number | undefined;

  constructor(
    private readonly physics: PhysicsSystem,
    private readonly events: GameEventBus,
    spawn: THREE.Vector3,
    readonly isPlayer: boolean,
    energy: EnergyPool,
    readonly spec: TitanSpec,
    opts: { plowsThrough?: boolean } = {},
  ) {
    this.plowsThrough = opts.plowsThrough ?? false;
    this.kccGroups = this.plowsThrough ? collisionGroups(GROUP.TITAN, ALL_GROUPS & ~GROUP.STRUCTURE) : undefined;
    this.model = new TitanModel(spec.design, spec.combat);
    this.motor = new TitanMotor(spec.movement);
    this.gait = new Gait(spec.gait);
    this.scale = spec.body.height / MODEL_DESIGN_HEIGHT;
    const { capsuleHalfHeight: hh, capsuleRadius: r } = spec.body;
    this.centerOffset = hh + r;
    this.position.copy(spawn);
    this.prevPosition.copy(spawn);

    const world = physics.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + this.centerOffset, spawn.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(hh, r), this.body);

    const c = TITAN_CONTROLLER;
    this.controller = world.createCharacterController(c.offset);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(c.maxSlopeClimbDeg));
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(c.minSlopeSlideDeg));
    this.controller.enableAutostep(c.autostepHeight, c.autostepMinWidth, false);
    this.controller.enableSnapToGround(c.snapToGround);
    
    this.model.object.scale.setScalar(this.scale);
    this.fsm = new StateMachine<TitanState, Titan>('idle', {}, this);
    const titan = this;
    this.combat = new TitanCombat(
      {
        position: this.position,
        get yaw() {
          return titan.motor.yaw;
        },
        mouthHeight: MOUTH_DESIGN.height * this.scale,
        mouthForward: MOUTH_DESIGN.forward * this.scale,
        get state() {
          return titan.fsm.state;
        },
        setState: (s) => this.fsm.transition(s),
      },
      energy,
      spec.combat,
    );
  }

  get state(): TitanState {
    return this.fsm.state;
  }

  get yaw(): number {
    return this.motor.yaw;
  }

  fixedUpdate(dt: number, intent: MoveIntent, combatInput: CombatInput = NO_COMBAT): void {
    this.prevPosition.copy(this.position);
    this.prevYaw = this.motor.yaw;
    this.time += dt;

    const allow = this.combat.update(dt, combatInput);
    _scaledIntent.x = intent.x * allow.moveMultiplier;
    _scaledIntent.z = intent.z * allow.moveMultiplier;
    _scaledIntent.sprint = intent.sprint && allow.moveMultiplier >= 1;
    // Strafe-facing only while free to move (attacks use their own facing rules).
    _scaledIntent.faceYaw = allow.moveMultiplier > 0 ? intent.faceYaw : null;
    if (allow.lungeSpeed > 0) this.motor.lungeForward(allow.lungeSpeed);
    this.motor.update(_scaledIntent, dt, allow.turnMultiplier);
    if (allow.faceYaw !== null) this.motor.faceToward(allow.faceYaw, allow.faceRate, dt);

    // Gravity only while airborne. Pushing down while grounded makes Rapier's KCC
    // stall horizontally; snap-to-ground keeps us glued on the way down instead.
    this.verticalVelocity = this.grounded ? 0 : this.verticalVelocity + SIM.gravity * TITAN_CONTROLLER.gravityScale * dt;
    _desired.x = this.motor.velocityX * dt * this.travelMultiplier;
    _desired.y = this.verticalVelocity * dt;
    _desired.z = this.motor.velocityZ * dt * this.travelMultiplier;

    // Debris (dynamic bodies) never blocks the titan; it walks through and kicks it via footsteps.
    this.controller.computeColliderMovement(this.collider, _desired, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, this.kccGroups);
    const moved = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    // Beyond the terrain colliders (physics radius) follow the analytic ground instead.
    const groundY = terrain.heightAt(this.position.x + moved.x, this.position.z + moved.z);
    if (!this.grounded && this.position.y + moved.y < groundY + 3) {
      moved.y = groundY - this.position.y;
      this.grounded = true;
      this.verticalVelocity = 0;
    }
    this.contacts.length = 0;
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const hit = this.controller.computedCollision(i);
      // Ignore the ground: only count roughly horizontal pushes.
      if (hit?.collider && Math.abs(hit.normal1.y) < 0.7) this.contacts.push(hit.collider.handle);
    }
    this.impactSpeed = this.motor.speed;

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
      this.fsm.transition(locomotionState(this.motor.speed, this.motor.sprinting, this.spec.movement));
    }
    this.fsm.update(dt);
  }

  /** Move instantly (respawn). Clears momentum and interpolation. */
  teleport(x: number, z: number, yaw: number): void {
    const y = terrain.heightAt(x, z);
    this.position.set(x, y, z);
    this.prevPosition.copy(this.position);
    this.renderPosition.copy(this.position);
    this.motor.yaw = this.motor.moveYaw = yaw;
    this.prevYaw = yaw;
    this.motor.speed = 0;
    this.verticalVelocity = 0;
    this.body.setTranslation({ x, y: y + this.centerOffset, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + this.centerOffset, z });
  }

  /** Apply upgrade multipliers (player progression). */
  setModifiers(mods: TitanModifiers): void {
    this.combat.mods = mods;
    this.motor.speedMultiplier = mods.moveSpeed;
    this.combat.health.setMaxMultiplier(mods.maxHealth);
  }

  /** Keep the body inside a circle (arena barrier). Call after fixedUpdate. Returns true if it pushed. */
  constrain(cx: number, cz: number, radius: number): boolean {
    if (!constrainToCircle(this.position, cx, cz, radius - this.spec.body.capsuleRadius)) return false;
    this.motor.speed *= 0.5;
    this.body.setNextKinematicTranslation({ x: this.position.x, y: this.position.y + this.centerOffset, z: this.position.z });
    return true;
  }

  render(alpha: number, frameDt: number): void {
    this.renderPosition.lerpVectors(this.prevPosition, this.position, alpha);
    this.renderPosition.y -= this.sink;
    const yaw = this.prevYaw + wrapAngle(this.motor.yaw - this.prevYaw) * alpha;
    this.model.object.position.copy(this.renderPosition);
    this.model.object.rotation.y = yaw;

    let p0 = this.gait.prevPhase;
    const p1 = this.gait.phase;
    if (p1 < p0) p0 -= 1;
    const phase = (p0 + (p1 - p0) * alpha + 1) % 1;
    const sprinting = this.motor.sprinting;
    const stride = sprinting ? this.spec.gait.sprintStride : this.spec.gait.walkStride;

    this.model.pose({
      phase,
      speedRatio: this.motor.speed / this.spec.movement.walkSpeed,
      stepping: !this.gait.isPlanted() || this.motor.speed > this.spec.movement.idleSpeed,
      sprinting: sprinting && this.motor.speed > this.spec.movement.walkSpeed,
      turnVelocity: this.motor.turnVelocity,
      strideAngle: Math.asin(Math.min(0.8, stride / 4 / (this.model.legLength * this.scale))),
      time: this.time,
      dt: frameDt,
      action: this.combat.action,
      beamPitch: Math.asin(this.combat.beamDir.y),
    });
    this.plantFeet(yaw, frameDt);
  }

  /** Feet meet uneven ground; the torso leans into slopes. Off while lying down. */
  private plantFeet(yaw: number, dt: number): void {
    const down = this.fsm.is('knockdown', 'defeated');
    this.plantWeight = damp(this.plantWeight, down ? 0 : 1, 0.15, dt);
    const p = this.renderPosition;
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const k = this.scale;
    // Relative to where the body actually stands (the capsule rides a little high on slopes).
    const base = p.y;
    // Model space (design units, +Z forward) → world.
    const groundAt = (lx: number, lz: number) => (terrain.heightAt(p.x + (lx * c + lz * s) * k, p.z + (-lx * s + lz * c) * k) - base) / k;
    const reach = 20 * k;
    const slope = Math.atan2(terrain.heightAt(p.x + s * reach, p.z + c * reach) - terrain.heightAt(p.x - s * reach, p.z - c * reach), 2 * reach);
    this.model.plantFeet(groundAt, slope, this.plantWeight);
  }

  private emitFootstep(foot: 'left' | 'right'): void {
    const side = foot === 'left' ? 1 : -1;
    const stride = this.motor.sprinting ? this.spec.gait.sprintStride : this.spec.gait.walkStride;
    const lx = this.spec.body.footSpread * side;
    const footCenter = 4.5 * this.scale;
    const lz = this.motor.speed > this.spec.movement.idleSpeed ? stride / 4 + footCenter : footCenter;
    const s = Math.sin(this.motor.yaw);
    const c = Math.cos(this.motor.yaw);
    const fx = this.position.x + lx * c + lz * s;
    const fz = this.position.z - lx * s + lz * c;
    this.events.emit('titan:footstep', {
      x: fx,
      y: terrain.heightAt(fx, fz),
      z: fz,
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
