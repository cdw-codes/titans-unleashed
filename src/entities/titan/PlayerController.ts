import type { InputState } from '../../input/InputState';
import type { CombatInput } from './TitanCombat';
import type { MoveIntent } from './TitanMotor';

/** Turns WASD + camera yaw into a MoveIntent, and buttons + crosshair into CombatInput. */
export class PlayerController {
  readonly intent: MoveIntent = { x: 0, z: 0, sprint: false };
  readonly combat: CombatInput = { claw: false, tail: false, stomp: false, roar: false, beamHeld: false, pulse: false, aim: null };
  /** World point under the crosshair, refreshed every render frame by the camera. */
  readonly aimPoint = { x: 0, y: 0, z: 0 };
  hasAim = false;
  /** Lock-on target: strafe facing it, and aim at its chest. */
  lockTarget: { x: number; y: number; z: number; aimHeight: number } | null = null;
  private readonly lockAim = { x: 0, y: 0, z: 0 };

  update(input: InputState, cameraYaw: number, selfX = 0, selfZ = 0): MoveIntent {
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
    const lock = this.lockTarget;
    this.intent.faceYaw = lock ? Math.atan2(lock.x - selfX, lock.z - selfZ) : null;

    const c = this.combat;
    c.claw = input.wasPressed('claw');
    c.tail = input.wasPressed('tail');
    c.stomp = input.wasPressed('stomp');
    c.roar = input.wasPressed('roar');
    c.pulse = input.wasPressed('pulse');
    c.beamHeld = input.isDown('beam');
    if (lock) {
      this.lockAim.x = lock.x;
      this.lockAim.y = lock.y + lock.aimHeight;
      this.lockAim.z = lock.z;
      c.aim = this.lockAim;
    } else {
      c.aim = this.hasAim ? this.aimPoint : null;
    }
    return this.intent;
  }
}
