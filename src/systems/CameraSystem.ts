import * as THREE from 'three';
import { CAMERA } from '../config/camera';
import { MOUSE } from '../config/input';

/**
 * Basic third-person orbit around a follow target. Runs at render rate on
 * interpolated positions. Milestone 2 adds smoothing, collision avoidance and shake.
 */
export class CameraSystem {
  /** 0 = camera at +Z of the target, looking toward -Z. */
  yaw = 0;
  pitch = CAMERA.initialPitch;
  private readonly target = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  applyMouse(dx: number, dy: number): void {
    this.yaw -= dx * MOUSE.sensitivity;
    this.pitch += dy * MOUSE.sensitivity * (MOUSE.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, CAMERA.minPitch, CAMERA.maxPitch);
  }

  update(focus: THREE.Vector3): void {
    this.target.set(focus.x, focus.y + CAMERA.targetHeight, focus.z);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * CAMERA.distance,
      Math.max(2, this.target.y + Math.sin(this.pitch) * CAMERA.distance),
      this.target.z + Math.cos(this.yaw) * cp * CAMERA.distance,
    );
    this.camera.lookAt(this.target);
  }
}
