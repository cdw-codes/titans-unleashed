import type { InputState } from '../../input/InputState';
import type { MoveIntent } from './KaijuMotor';

/** Turns WASD + camera yaw into a world-space MoveIntent. */
export class PlayerController {
  readonly intent: MoveIntent = { x: 0, z: 0, sprint: false };

  update(input: InputState, cameraYaw: number): MoveIntent {
    const f = Number(input.isDown('moveForward')) - Number(input.isDown('moveBack'));
    const r = Number(input.isDown('moveRight')) - Number(input.isDown('moveLeft'));
    // Camera yaw 0 looks toward -Z.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    let x = -sin * f + cos * r;
    let z = -cos * f - sin * r;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    this.intent.x = x;
    this.intent.z = z;
    this.intent.sprint = input.isDown('sprint');
    return this.intent;
  }
}
