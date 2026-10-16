import type { InputState } from '../../input/InputState';
import type { CombatInput } from './KaijuCombat';
import type { MoveIntent } from './KaijuMotor';

/** Turns WASD + camera yaw into a MoveIntent, and buttons + crosshair into CombatInput. */
export class PlayerController {
  readonly intent: MoveIntent = { x: 0, z: 0, sprint: false };
  readonly combat: CombatInput = { claw: false, tail: false, stomp: false, roar: false, beamHeld: false, aim: null };
  /** World point under the crosshair, refreshed every render frame by the camera. */
  readonly aimPoint = { x: 0, y: 0, z: 0 };
  hasAim = false;

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

    const c = this.combat;
    c.claw = input.wasPressed('claw');
    c.tail = input.wasPressed('tail');
    c.stomp = input.wasPressed('stomp');
    c.roar = input.wasPressed('roar');
    c.beamHeld = input.isDown('beam');
    c.aim = this.hasAim ? this.aimPoint : null;
    return this.intent;
  }
}
