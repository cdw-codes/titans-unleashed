import type { TitanBodyConfig, TitanGaitConfig, TitanMovementConfig } from '../../config/titan';
import { TITAN_BODY, TITAN_GAIT, TITAN_MOVEMENT } from '../../config/titan';
import type { CombatConfig } from '../../config/combat';
import { COMBAT } from '../../config/combat';
import { PLAYER_DESIGN, type TitanDesign } from './designs';

/** Everything that makes one titan different from another. Player and rivals share the Titan class. */
export interface TitanSpec {
  readonly name: string;
  readonly body: TitanBodyConfig;
  readonly movement: TitanMovementConfig;
  readonly gait: TitanGaitConfig;
  readonly combat: CombatConfig;
  readonly design: TitanDesign;
  /** Tonnes (footfall weight); the reference titan when absent. */
  readonly weight?: number;
}

export const PLAYER_SPEC: TitanSpec = {
  name: 'Player',
  body: TITAN_BODY,
  movement: TITAN_MOVEMENT,
  gait: TITAN_GAIT,
  combat: COMBAT,
  design: PLAYER_DESIGN,
};
