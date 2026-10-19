import type { EncounterConfig } from '../../config/encounters';
import type { RivalId } from '../../config/rivals';

export type EncounterPhase = 'roaming' | 'warning' | 'approaching' | 'arena' | 'outro';

export type EncounterAction =
  | { type: 'warn'; rival: RivalId; dirX: number; dirZ: number }
  | { type: 'tremor'; trauma: number }
  | { type: 'spawn'; rival: RivalId; x: number; z: number }
  | { type: 'barrierUp'; x: number; z: number; radius: number }
  | { type: 'victory'; rival: RivalId }
  | { type: 'playerDefeated' }
  | { type: 'end'; victory: boolean };

export interface EncounterWorld {
  score: number;
  playerX: number;
  playerZ: number;
  rivalX: number;
  rivalZ: number;
  playerDefeated: boolean;
  rivalDefeated: boolean;
  /** Distance (m) beyond which nothing is rendered (fog end); rivals spawn past it. */
  hiddenDistance: number;
  /** Rivals never spawn east of this x (the sea). */
  maxX: number;
}

/**
 * Ambush flow, pure logic: roaming → warning (tremors) → rival spawns and
 * approaches → barrier rises → fight → outro → roaming. Returns actions for
 * the game to carry out (spawn, raise barrier, ...). Deterministic given `rand`.
 */
export class EncounterSystem {
  phase: EncounterPhase = 'roaming';
  /** Seconds in the current phase. */
  t = 0;
  rival: RivalId | null = null;
  /** Unit direction from the player toward where the rival comes from (compass). */
  readonly dir = { x: 0, z: 1 };
  readonly arena = { x: 0, z: 0, radius: 0, active: false };
  private count = 0;
  private scoreAtLast = 0;
  private nextTremor = 0;
  private victory = false;

  /** Rivals in the order they arrive (the player's own titan is left out). */
  private rotation: readonly RivalId[];

  /** Leave a rival out of the rotation (the one the player looks like), if others remain. */
  excludeRival(id: RivalId | undefined): void {
    const rest = this.cfg.rotation.filter((r) => r !== id);
    this.rotation = rest.length ? rest : this.cfg.rotation;
  }

  constructor(
    private readonly cfg: EncounterConfig,
    private readonly rand: () => number = Math.random,
  ) {
    this.rotation = cfg.rotation;
  }

  get roamingDelay(): number {
    return this.count === 0 ? this.cfg.firstDelay : this.cfg.interval;
  }

  /** Debug: skip straight to the warning. */
  forceStart(): void {
    if (this.phase === 'roaming') this.t = Number.POSITIVE_INFINITY;
  }

  update(dt: number, w: EncounterWorld): EncounterAction[] {
    const c = this.cfg;
    const out: EncounterAction[] = [];
    this.t += dt;
    switch (this.phase) {
      case 'roaming': {
        const triggered = this.t >= this.roamingDelay || w.score - this.scoreAtLast >= c.destructionThreshold;
        if (triggered) {
          this.rival = this.rotation[this.count % this.rotation.length]!;
          const a = this.rand() * Math.PI * 2;
          this.dir.x = Math.sin(a);
          this.dir.z = Math.cos(a);
          // Come from inland: if the farthest spawn would be at sea, flip toward the west.
          const far = w.hiddenDistance + c.spawnBeyondFog + c.spawnJitter;
          if (w.playerX + this.dir.x * far > w.maxX) this.dir.x = -Math.abs(this.dir.x);
          this.enter('warning');
          this.nextTremor = 0;
          out.push({ type: 'warn', rival: this.rival, dirX: this.dir.x, dirZ: this.dir.z });
        }
        break;
      }
      case 'warning': {
        if (this.t >= this.nextTremor) {
          const k = Math.min(1, this.t / c.warningSeconds);
          out.push({ type: 'tremor', trauma: c.tremorTraumaMin + (c.tremorTraumaMax - c.tremorTraumaMin) * k });
          this.nextTremor += c.tremorInterval;
        }
        if (this.t >= c.warningSeconds) {
          const d = w.hiddenDistance + c.spawnBeyondFog + this.rand() * c.spawnJitter;
          out.push({ type: 'spawn', rival: this.rival!, x: w.playerX + this.dir.x * d, z: w.playerZ + this.dir.z * d });
          this.enter('approaching');
        }
        break;
      }
      case 'approaching':
      case 'arena': {
        // Keep the compass pointing at the rival.
        const dx = w.rivalX - w.playerX;
        const dz = w.rivalZ - w.playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist > 1) {
          this.dir.x = dx / dist;
          this.dir.z = dz / dist;
        }
        if (w.playerDefeated) {
          // Drop the barrier at once so the respawned player isn't pulled back into the arena.
          this.arena.active = false;
          out.push({ type: 'playerDefeated' });
          this.victory = false;
          this.enter('outro');
          break;
        }
        if (w.rivalDefeated) {
          out.push({ type: 'victory', rival: this.rival! });
          this.victory = true;
          this.enter('outro');
          break;
        }
        if (this.phase === 'approaching' && (dist <= c.arenaTriggerDistance || this.t >= c.maxApproachSeconds)) {
          this.arena.x = (w.playerX + w.rivalX) / 2;
          this.arena.z = (w.playerZ + w.rivalZ) / 2;
          this.arena.radius = Math.max(c.arenaRadius, dist / 2 + 80);
          this.arena.active = true;
          out.push({ type: 'barrierUp', x: this.arena.x, z: this.arena.z, radius: this.arena.radius });
          this.enter('arena');
        }
        break;
      }
      case 'outro': {
        if (this.t >= c.outroSeconds) {
          this.arena.active = false;
          out.push({ type: 'end', victory: this.victory });
          this.count++;
          this.scoreAtLast = w.score;
          this.rival = null;
          this.enter('roaming');
        }
        break;
      }
    }
    return out;
  }

  private enter(phase: EncounterPhase): void {
    this.phase = phase;
    this.t = 0;
  }
}

/** Push a point back inside a circle (minus a margin). Returns true if it was outside. */
export function constrainToCircle(p: { x: number; z: number }, cx: number, cz: number, radius: number): boolean {
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d = Math.hypot(dx, dz);
  if (d <= radius) return false;
  p.x = cx + (dx / d) * radius;
  p.z = cz + (dz / d) * radius;
  return true;
}
