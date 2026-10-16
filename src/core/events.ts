import { EventBus } from './EventBus';
import type { QualityLevel } from '../config/quality';

/** Global game events. Add entries here as systems need to talk to each other. */
export interface GameEvents {
  'game:pause': { paused: boolean };
  'debug:toggle': { enabled: boolean };
  'quality:change': { level: QualityLevel };
}

export type GameEventBus = EventBus<GameEvents>;
export const createEventBus = (): GameEventBus => new EventBus<GameEvents>();
