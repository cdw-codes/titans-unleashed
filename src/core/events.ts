import { EventBus } from './EventBus';
import type { QualityLevel } from '../config/quality';
import type { Foot } from '../entities/titan/Gait';
import type { MoveId } from '../entities/titan/TitanCombat';
import type { SizeClass, StructureKind } from '../world/city/types';

/** Global game events. Add entries here as systems need to talk to each other. */
export interface GameEvents {
  'game:pause': { paused: boolean };
  'debug:toggle': { enabled: boolean };
  'quality:change': { level: QualityLevel };
  /** A titan foot hit the ground (sim tick). Drives camera shake, dust, crushing. */
  'titan:footstep': {
    x: number; y: number; z: number; foot: Foot; sprinting: boolean; isPlayer: boolean;
    /** A network player's titan: felt and seen, but its owner settles what it crushes. */
    remote: boolean;
    /** Body size relative to the model's design height; scales dust and impact effects. */
    scale: number;
  };
  /** An area attack landed (sim tick). `hits` = structures/titan affected. */
  'combat:impact': { move: MoveId; x: number; z: number; yaw: number; radius: number; hits: number; isPlayer: boolean };
  /** A roar went off: stuns enemies in radius (M5+), drives shake and the shockwave visual. */
  'titan:roar': { x: number; z: number; radius: number; stunSeconds: number; isPlayer: boolean };
  /** A titan reacted to a hit. */
  'titan:hurt': { reaction: 'stagger' | 'knockdown' | 'defeated'; isPlayer: boolean; x: number; z: number };
  /** Encounter beats (for audio and UI). Position is where it happens (or the player). */
  'encounter:event': { type: 'warn' | 'spawn' | 'barrier' | 'victory' | 'playerDefeated' | 'end'; x: number; z: number };
  /** A military unit fired. */
  'military:fire': { kind: 'tank' | 'heli'; x: number; y: number; z: number };
  /** Something exploded (shell, rocket, plasma orb, crashing helicopter). size ~0..1. */
  'fx:explosion': { x: number; y: number; z: number; size: number };
  /** The player lost health. */
  'player:damaged': { amount: number };
  /** A structure was destroyed (crushed instantly or started collapsing). */
  'structure:destroyed': { kind: StructureKind; size: SizeClass; x: number; z: number; height: number; points: number; byPlayer: boolean;
    /** Chunk + index in the deterministic world (multiplayer sync). */
    cx: number; cz: number; index: number };
}

export type GameEventBus = EventBus<GameEvents>;
export const createEventBus = (): GameEventBus => new EventBus<GameEvents>();
