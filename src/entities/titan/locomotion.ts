import type { TitanMovementConfig } from '../../config/titan';

export type TitanState =
  | 'idle'
  | 'walk'
  | 'sprint'
  | 'attack'
  | 'stomp'
  | 'beamCharge'
  | 'beamFire'
  | 'roar'
  | 'stagger'
  | 'knockdown'
  | 'defeated';

export const LOCOMOTION_STATES: readonly TitanState[] = ['idle', 'walk', 'sprint'];

/** Which locomotion state matches the motor's current speed. */
export function locomotionState(speed: number, sprinting: boolean, cfg: TitanMovementConfig): TitanState {
  if (speed < cfg.idleSpeed) return 'idle';
  return sprinting && speed > cfg.walkSpeed * 0.9 ? 'sprint' : 'walk';
}
