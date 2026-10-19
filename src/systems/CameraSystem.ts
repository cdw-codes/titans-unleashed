import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CAMERA, SHAKE } from '../config/camera';
import { MOUSE } from '../config/input';
import { clamp, damp } from '../core/math';
import type { PhysicsSystem } from './PhysicsSystem';
import { CameraShake } from './CameraShake';
import { terrain } from '../world/terrain/Terrain';

const _desired = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _ray = { x: 0, y: 0, z: 0 };
const _identity = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Third-person orbit camera at render rate: mouse-driven yaw/pitch, lagged
 * follow for weight, sphere-cast collision (snap in fast, ease out slowly),
 * trauma shake + footstep kick, sprint FOV.
 */
export class CameraSystem {
  /** 0 = camera at +Z of the target, looking toward -Z. */
  yaw = 0;
  pitch = CAMERA.initialPitch;
  readonly shake = new CameraShake(SHAKE);
  /** Smoothed follow point (titan feet). */
  readonly focus = new THREE.Vector3();
  private readonly pivot = new THREE.Vector3();
  private distance = CAMERA.distance;
  private fovBoost = 0;
  private initialized = false;
  private readonly probe = new RAPIER.Ball(CAMERA.collisionRadius);
  /** Lock-on: world yaw the camera should look along (toward the target), or null. */
  lockYaw: number | null = null;
  private exclude: RAPIER.RigidBody | undefined;

  get renderCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly physics: PhysicsSystem,
  ) {}

  /** The followed body is ignored by collision probes. */
  setTarget(body: RAPIER.RigidBody, facingYaw: number): void {
    this.exclude = body;
    this.yaw = facingYaw + Math.PI;
  }

  /** Jump straight to the target on the next update (after a teleport), facing `yaw`. */
  /** Frame a titan of this height (m): pivot height, distance and shoulder offset scale with it. */
  setSize(height: number): void {
    this.size = height / 100;
    this.distance = CAMERA.distance * this.size;
  }

  private size = 1;

  snap(facingYaw: number): void {
    this.initialized = false;
    this.yaw = facingYaw + Math.PI;
    this.distance = CAMERA.distance * this.size;
  }

  applyMouse(dx: number, dy: number): void {
    // Locked on: horizontal look is driven by the target; mouse still controls pitch.
    if (this.lockYaw === null) this.yaw -= dx * MOUSE.sensitivity;
    this.pitch += dy * MOUSE.sensitivity * (MOUSE.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, CAMERA.minPitch, CAMERA.maxPitch);
  }

  update(target: THREE.Vector3, dt: number, sprintAmount: number): void {
    const C = CAMERA;
    if (!this.initialized) {
      this.focus.copy(target);
      this.initialized = true;
    }
    if (this.lockYaw !== null) {
      // Camera sits opposite the look direction (yaw 0 looks toward -Z).
      const want = this.lockYaw + Math.PI + C.lockOnSideAngle;
      const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
      this.yaw += d * Math.min(1, dt * C.lockOnTracking);
    }
    this.focus.x = damp(this.focus.x, target.x, C.followHalfLife, dt);
    this.focus.z = damp(this.focus.z, target.z, C.followHalfLife, dt);
    this.focus.y = damp(this.focus.y, target.y, C.followHalfLifeY, dt);

    // Pivot above the titan, nudged to the camera's right.
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.pivot.copy(this.focus).addScaledVector(_right, C.shoulderOffset * this.size);
    this.pivot.y += C.pivotHeight * this.size;

    const cp = Math.cos(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // Collision: snap in immediately-ish, ease back out slowly.
    const allowed = this.probeDistance(C.distance * this.size);
    const halfLife = allowed < this.distance ? C.pullInHalfLife : C.easeOutHalfLife;
    this.distance = damp(this.distance, allowed, halfLife, dt);

    _desired.copy(this.pivot).addScaledVector(_dir, this.distance);
    _desired.y = Math.max(_desired.y, this.focus.y + C.groundClearance, Math.max(terrain.heightAt(_desired.x, _desired.z), terrain.waterLevel) + C.groundClearance + 6);

    this.shake.update(dt);
    const o = this.shake.offset;
    this.camera.position.copy(_desired).addScaledVector(_right, o.x);
    this.camera.position.y += o.y;
    this.camera.lookAt(this.pivot);
    this.camera.rotateZ(o.roll);
    this.camera.rotateY(o.yaw);
    this.camera.rotateX(o.pitch);

    this.fovBoost = damp(this.fovBoost, sprintAmount * C.sprintFovBoost, 0.6, dt);
    const fov = C.fov + this.fovBoost;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private probeDistance(max: number): number {
    _ray.x = _dir.x;
    _ray.y = _dir.y;
    _ray.z = _dir.z;
    const hit = this.physics.world.castShape(
      this.pivot,
      _identity,
      _ray,
      this.probe,
      0,
      max,
      false,
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
      undefined,
      undefined,
      this.exclude,
    );
    if (!hit) return max;
    return clamp(hit.time_of_impact - CAMERA.collisionMargin, CAMERA.minDistance, max);
  }
}
