import type { HealthConfig } from '../../config/combat';

export type HitReaction = 'none' | 'stagger' | 'knockdown' | 'defeated';

/** Health + poise + out-of-combat regen. Pure logic: callers decide what a reaction does to the body. */
export class Health {
  health: number;
  poise: number;
  /** Max-health multiplier (upgrades). Raising it heals by the difference. */
  private mult = 1;
  private invulnerable = 0;
  private sinceHit = Number.POSITIVE_INFINITY;

  constructor(private readonly cfg: HealthConfig) {
    this.health = cfg.maxHealth;
    this.poise = cfg.maxPoise;
  }

  get max(): number {
    return this.cfg.maxHealth * this.mult;
  }

  get fraction(): number {
    return this.health / this.max;
  }

  get isDefeated(): boolean {
    return this.health <= 0;
  }

  get isInvulnerable(): boolean {
    return this.invulnerable > 0;
  }

  setMaxMultiplier(m: number): void {
    const gained = this.cfg.maxHealth * (m - this.mult);
    this.mult = m;
    if (!this.isDefeated) this.health = Math.min(this.max, this.health + Math.max(0, gained));
  }

  update(dt: number): void {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.poise = Math.min(this.cfg.maxPoise, this.poise + this.cfg.poiseRegen * dt);
    this.sinceHit += dt;
    const regen = this.cfg.regenPerSecond ?? 0;
    if (regen > 0 && !this.isDefeated && this.sinceHit >= (this.cfg.regenDelay ?? 0)) {
      this.health = Math.min(this.max, this.health + regen * dt);
    }
  }

  makeInvulnerable(seconds: number): void {
    this.invulnerable = Math.max(this.invulnerable, seconds);
  }

  /** Apply a hit; `poiseDamage` defaults to the damage. */
  hit(damage: number, poiseDamage = damage): HitReaction {
    if (this.isDefeated || this.isInvulnerable || damage <= 0) return 'none';
    this.sinceHit = 0;
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
    this.health = this.max;
    this.poise = this.cfg.maxPoise;
    this.invulnerable = 0;
    this.sinceHit = Number.POSITIVE_INFINITY;
  }
}
