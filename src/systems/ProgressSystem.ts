import type { DestructionConfig } from '../config/destruction';
import type { SizeClass } from '../world/city/types';

/** Destruction score and beam energy. Pure logic; wired to events in Game. */
export class ProgressSystem {
  score = 0;
  energy = 0;
  destroyed = 0;
  /** Upgrade multiplier on energy gained from destruction. */
  energyMultiplier = 1;

  constructor(private readonly cfg: DestructionConfig) {}

  get energyFraction(): number {
    return this.energy / this.cfg.maxEnergy;
  }

  onDestroyed(points: number, size: SizeClass): void {
    this.score += points;
    this.destroyed++;
    this.gainEnergy(this.cfg.energy[size]);
  }

  gainEnergy(amount: number): void {
    this.energy = Math.min(this.cfg.maxEnergy, this.energy + amount * this.energyMultiplier);
  }

  /** Spend energy (beam, M4). Returns false if there isn't enough. */
  spend(amount: number): boolean {
    if (this.energy < amount) return false;
    this.energy -= amount;
    return true;
  }
}
