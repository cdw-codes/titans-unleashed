import { EventBus } from './EventBus';
import type { QualityLevel } from '../config/quality';
import type { Foot } from '../entities/kaiju/Gait';

/** Global game events. Add entries here as systems need to talk to each other. */
export interface GameEvents {
  'game:pause': { paused: boolean };
  'debug:toggle': { enabled: boolean };
  'quality:change': { level: QualityLevel };
  /** A kaiju foot hit the ground (sim tick). Drives camera shake, dust, crushing. */
  'kaiju:footstep': { x: number; y: number; z: number; foot: Foot; sprinting: boolean; isPlayer: boolean };
}

export type GameEventBus = EventBus<GameEvents>;
export const createEventBus = (): GameEventBus => new EventBus<GameEvents>();
