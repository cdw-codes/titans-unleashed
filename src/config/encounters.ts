import type { RivalId } from './rivals';

export interface EncounterConfig {
  /** Seconds of roaming before the first ambush, and between later ones. */
  readonly firstDelay: number;
  readonly interval: number;
  /** Destruction points since the last encounter that trigger one early. */
  readonly destructionThreshold: number;
  /** Warning phase: tremors and a distant roar before the rival appears. */
  readonly warningSeconds: number;
  readonly tremorInterval: number;
  readonly tremorTraumaMin: number;
  readonly tremorTraumaMax: number;
  /** Rival spawns this far (m) from the player, ± jitter. Keep beyond CITY.physicsRadius. */
  readonly spawnDistance: number;
  readonly spawnJitter: number;
  /** The barrier rises when the two kaiju get this close (m)... */
  readonly arenaTriggerDistance: number;
  /** ...or after this long approaching, wherever they are. */
  readonly maxApproachSeconds: number;
  readonly arenaRadius: number;
  readonly barrierHeight: number;
  /** Seconds from the rival's defeat (or the player's) until the barrier drops. */
  readonly outroSeconds: number;
  readonly victoryPoints: number;
  readonly victoryEnergy: number;
  /** Order rivals appear in (loops). */
  readonly rotation: readonly RivalId[];
}

export const ENCOUNTERS: EncounterConfig = {
  firstDelay: 75,
  interval: 150,
  destructionThreshold: 6000,
  warningSeconds: 8,
  tremorInterval: 1.4,
  tremorTraumaMin: 0.12,
  tremorTraumaMax: 0.4,
  spawnDistance: 750,
  spawnJitter: 100,
  arenaTriggerDistance: 320,
  maxApproachSeconds: 45,
  arenaRadius: 380,
  barrierHeight: 420,
  outroSeconds: 5,
  victoryPoints: 2500,
  victoryEnergy: 50,
  rotation: ['thornmaw', 'vesperion'],
};
