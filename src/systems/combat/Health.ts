import type { HealthConfig } from '../../config/combat';

export type HitReaction = 'none' | 'stagger' | 'knockdown' | 'defeated';

/** Health + poise. Pure logic: callers decide what the reaction does to the body. */
export class Health {
  health: number;
  poise: number;
  private invulnerable = 0;

  constructor(private readonly cfg: HealthConfig) {
    this.health = cfg.maxHealth;
    this.poise = cfg.maxPoise;
  }

  get fraction(): number {
    return this.health / this.cfg.maxHealth;
  }

  get isDefeated(): boolean {
    return this.health <= 0;
  }

  get isInvulnerable(): boolean {
    return this.invulnerable > 0;
  }

  update(dt: number): void {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.poise = Math.min(this.cfg.maxPoise, this.poise + this.cfg.poiseRegen * dt);
  }

  makeInvulnerable(seconds: number): void {
    this.invulnerable = Math.max(this.invulnerable, seconds);
  }

  /** Apply a hit; `poiseDamage` defaults to the damage. */
  hit(damage: number, poiseDamage = damage): HitReaction {
    if (this.isDefeated || this.isInvulnerable || damage <= 0) return 'none';
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) return 'defeated';
    if (damage >= this.cfg.knockdownThreshold) {
      this.poise = this.cfg.maxPoise;
      return 'knockdown';
    }
    this.poise -= poiseDamage;
    if (this.poise <= 0) {
      this.poise = this.cfg.maxPoise;
      return 'stagger';
    }
    return 'none';
  }

  reset(): void {
    this.health = this.cfg.maxHealth;
    this.poise = this.cfg.maxPoise;
    this.invulnerable = 0;
  }
}
