/** Abilities shown in the player's HUD. */
export type PlayerAbility = 'claw' | 'tail' | 'stomp' | 'beam' | 'roar';

export interface HudState {
  score: number;
  energy: number;
  health: number;
  /** 0 = ready, 1 = just used; per ability. */
  cooldowns: Record<PlayerAbility, number>;
  /** Ability is usable right now (enough energy, not busy...). */
  usable: Record<PlayerAbility, boolean>;
  /** Beam charge 0..1 (shown on the crosshair). */
  charge: number;
}

const ABILITIES: { id: PlayerAbility; key: string; label: string }[] = [
  { id: 'claw', key: 'LMB', label: 'CLAW' },
  { id: 'tail', key: 'RMB', label: 'TAIL' },
  { id: 'stomp', key: 'SPACE', label: 'STOMP' },
  { id: 'beam', key: 'E', label: 'BEAM' },
  { id: 'roar', key: 'R', label: 'ROAR' },
];

/** In-game HUD: health, energy, destruction score, ability cooldowns. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly score: HTMLSpanElement;
  private readonly energyFill: HTMLDivElement;
  private readonly healthFill: HTMLDivElement;
  private readonly slots = new Map<PlayerAbility, { el: HTMLDivElement; fill: HTMLDivElement }>();
  private readonly last = new Map<string, string | number | boolean>();
  private readonly vignette: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-score"><span class="hud-label">DESTRUCTION</span><span class="hud-score-value">0</span></div>
      <div class="hud-bar"><span class="hud-label">HEALTH</span><div class="hud-bar-track"><div class="hud-bar-fill health"></div></div></div>
      <div class="hud-bar"><span class="hud-label">ENERGY</span><div class="hud-bar-track"><div class="hud-bar-fill energy"></div></div></div>
      <div class="hud-abilities"></div>`;
    parent.appendChild(this.root);
    this.vignette = document.createElement('div');
    this.vignette.className = 'hud-damage';
    parent.appendChild(this.vignette);
    this.score = this.root.querySelector('.hud-score-value')!;
    this.energyFill = this.root.querySelector('.hud-bar-fill.energy')!;
    this.healthFill = this.root.querySelector('.hud-bar-fill.health')!;
    const row = this.root.querySelector('.hud-abilities')!;
    for (const a of ABILITIES) {
      const el = document.createElement('div');
      el.className = 'hud-ability';
      el.innerHTML = `<div class="hud-ability-cd"></div><span class="hud-ability-key">${a.key}</span><span class="hud-ability-name">${a.label}</span>`;
      row.appendChild(el);
      this.slots.set(a.id, { el, fill: el.querySelector('.hud-ability-cd')! });
    }
  }

  set visible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  /** Red edge flash when the player is hurt; stronger for bigger hits. */
  flashDamage(amount: number): void {
    this.vignette.style.setProperty('--strength', String(Math.min(1, 0.35 + amount / 250)));
    this.vignette.classList.remove('flash');
    void this.vignette.offsetWidth; // restart the animation
    this.vignette.classList.add('flash');
  }

  update(s: HudState): void {
    if (this.changed('score', s.score)) this.score.textContent = Math.round(s.score).toLocaleString();
    const e = round(s.energy);
    if (this.changed('energy', e)) this.energyFill.style.transform = `scaleX(${e})`;
    const h = round(s.health);
    if (this.changed('health', h)) {
      this.healthFill.style.transform = `scaleX(${h})`;
      this.healthFill.classList.toggle('low', h < 0.3);
    }
    for (const [id, slot] of this.slots) {
      const cd = round(s.cooldowns[id]);
      if (this.changed(`cd-${id}`, cd)) slot.fill.style.transform = `scaleY(${cd})`;
      if (this.changed(`ok-${id}`, s.usable[id])) slot.el.classList.toggle('unusable', !s.usable[id]);
    }
  }

  private changed(key: string, v: string | number | boolean): boolean {
    if (this.last.get(key) === v) return false;
    this.last.set(key, v);
    return true;
  }
}

const round = (v: number) => Math.round(v * 200) / 200;
