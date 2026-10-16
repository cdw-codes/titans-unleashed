import type { KaijuBodyConfig, KaijuGaitConfig, KaijuMovementConfig } from '../../config/kaiju';
import { KAIJU_BODY, KAIJU_GAIT, KAIJU_MOVEMENT } from '../../config/kaiju';
import type { CombatConfig } from '../../config/combat';
import { COMBAT } from '../../config/combat';
import { PLAYER_DESIGN, type KaijuDesign } from './designs';

/** Everything that makes one kaiju different from another. Player and rivals share the Kaiju class. */
export interface KaijuSpec {
  readonly name: string;
  readonly body: KaijuBodyConfig;
  readonly movement: KaijuMovementConfig;
  readonly gait: KaijuGaitConfig;
  readonly combat: CombatConfig;
  readonly design: KaijuDesign;
}

export const PLAYER_SPEC: KaijuSpec = {
  name: 'Player',
  body: KAIJU_BODY,
  movement: KAIJU_MOVEMENT,
  gait: KAIJU_GAIT,
  combat: COMBAT,
  design: PLAYER_DESIGN,
};
