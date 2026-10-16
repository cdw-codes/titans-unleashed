import { EventBus } from './EventBus';
import type { QualityLevel } from '../config/quality';
import type { Foot } from '../entities/kaiju/Gait';
import type { MoveId } from '../entities/kaiju/KaijuCombat';
import type { SizeClass, StructureKind } from '../world/city/types';

/** Global game events. Add entries here as systems need to talk to each other. */
export interface GameEvents {
  'game:pause': { paused: boolean };
  'debug:toggle': { enabled: boolean };
  'quality:change': { level: QualityLevel };
  /** A kaiju foot hit the ground (sim tick). Drives camera shake, dust, crushing. */
  'kaiju:footstep': {
    x: number; y: number; z: number; foot: Foot; sprinting: boolean; isPlayer: boolean;
    /** Body size relative to the model's design height; scales dust and impact effects. */
    scale: number;
  };
  /** An area attack landed (sim tick). `hits` = structures/kaiju affected. */
  'combat:impact': { move: MoveId; x: number; z: number; yaw: number; radius: number; hits: number; isPlayer: boolean };
  /** A roar went off: stuns enemies in radius (M5+), drives shake and the shockwave visual. */
  'kaiju:roar': { x: number; z: number; radius: number; stunSeconds: number; isPlayer: boolean };
  /** A kaiju reacted to a hit. */
  'kaiju:hurt': { reaction: 'stagger' | 'knockdown' | 'defeated'; isPlayer: boolean; x: number; z: number };
  /** A structure was destroyed (crushed instantly or started collapsing). */
  'structure:destroyed': { kind: StructureKind; size: SizeClass; x: number; z: number; height: number; points: number };
}

export type GameEventBus = EventBus<GameEvents>;
export const createEventBus = (): GameEventBus => new EventBus<GameEvents>();
