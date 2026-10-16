import * as THREE from 'three';
import { DEV_PROXY as CFG } from '../config/devProxy';
import type { InputState } from '../input/InputState';

/**
 * Milestone-1 scale stand-in: a kaiju-height capsule moved with WASD relative
 * to the camera. Fixed-tick simulation, interpolated rendering.
 * Replaced by the kaiju + character controller in Milestone 2.
 */
export class DevProxy {
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly renderPosition = new THREE.Vector3();
  private readonly prevPosition = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private yaw = 0;
  private prevYaw = 0;

  constructor() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x4f6f45 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(CFG.radius, CFG.height - CFG.radius * 2, 6, 16), mat);
    body.position.y = CFG.height / 2;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(CFG.radius, CFG.radius, CFG.radius * 1.5), mat);
    nose.position.set(0, CFG.height * 0.85, CFG.radius * 1.2);
    for (const m of [body, nose]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.object.add(m);
    }
  }

  fixedUpdate(dt: number, input: InputState, cameraYaw: number): void {
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;

    const f = Number(input.isDown('moveForward')) - Number(input.isDown('moveBack'));
    const r = Number(input.isDown('moveRight')) - Number(input.isDown('moveLeft'));
    // Camera looks down -Z at yaw 0; forward on the ground plane is (-sin, -cos).
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    this.wish.set(-sin * f + cos * r, 0, -cos * f - sin * r);
    if (this.wish.lengthSq() > 0) this.wish.normalize();
    const speed = input.isDown('sprint') ? CFG.sprintSpeed : CFG.walkSpeed;
    this.wish.multiplyScalar(speed);

    const k = 1 - Math.exp(-dt / CFG.acceleration);
    this.velocity.lerp(this.wish, k);
    this.position.addScaledVector(this.velocity, dt);

    if (this.velocity.lengthSq() > 0.25) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 2.5);
    }
  }

  render(alpha: number): void {
    this.renderPosition.lerpVectors(this.prevPosition, this.position, alpha);
    let d = this.yaw - this.prevYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.object.position.copy(this.renderPosition);
    this.object.rotation.y = this.prevYaw + d * alpha;
  }
}
