import { ACTION_LABELS, BINDINGS } from '../config/input';
import { ACTIONS, codeLabel } from '../input/actions';
import { randomSeed, reloadWith, type CityMapDef } from '../config/maps';
import { ROSTER, rosterTitan, type TitanChoice } from '../entities/titan/roster';
import { openWorldPreview } from './openWorldPreview';

/** Shared run stats shown on the pause and game-over screens. */
export interface RunStats {
  score: number;
  structures: number;
  units: number;
  rivals: number;
  /** Seconds of play. */
  time: number;
  threatPeak: number;
}

/** Read-only controls list (title and pause screens). Keys are fixed to config/input.ts. */
function controlsHtml(): string {
  const rows = ACTIONS.filter((a) => a !== 'debug').map((a) => {
    const keys = BINDINGS[a].map(codeLabel).join(' / ') || '—';
    return `<dt>${keys}</dt><dd>${ACTION_LABELS[a]}</dd>`;
  });
  return `<dl class="menu-controls">${rows.join('')}</dl>`;
}

function statsHtml(s: RunStats): string {
  const t = Math.floor(s.time);
  const time = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const rows: [string, string][] = [
    ['Destruction', s.score.toLocaleString()],
    ['Structures', s.structures.toLocaleString()],
    ['Military destroyed', String(s.units)],
    ['Rivals defeated', String(s.rivals)],
    ['Peak threat', '★'.repeat(s.threatPeak) || '—'],
    ['Time', time],
  ];
  return `<dl class="menu-stats">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

abstract class Screen {
  protected readonly el: HTMLDivElement;

  constructor(parent: HTMLElement, cls: string) {
    this.el = document.createElement('div');
    this.el.className = `menu-screen ${cls} hidden`;
    parent.appendChild(this.el);
  }

  get isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  set visible(v: boolean) {
    this.el.classList.toggle('hidden', !v);
  }
}

export interface TitleOptions {
  /** Cities with baked map files (the open world is always offered after them). */
  maps: readonly CityMapDef[];
  /** Loaded map id, or null for the open world. */
  currentMap: string | null;
  /** Loaded open-world seed (null while a city is loaded). */
  openSeed: number | null;
  /** Map data attribution for the loaded city. */
  credits: string | null;
  choice: TitanChoice;
  onStart: () => void;
  /** Titan or colorway changed: applies live to the titan on the right. */
  onTitan: (choice: TitanChoice) => void;
}

interface Location {
  id: string;
  name: string;
  blurb: string;
  img: string | null;
}

const LOGO_MARK = `<svg class="title-mark" viewBox="0 0 120 40" aria-hidden="true">
  <path d="M4 36 L22 20 L30 26 L46 6 L60 22 L74 6 L90 26 L98 20 L116 36" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Start screen: a left column (logo, start, controls, then location / titan /
 * colorway pickers) over the live scene, where a showcase camera frames the titan
 * on the right. Titan and colorway apply live; a different location loads when
 * the player presses the main button ("Travel to ...").
 */
export class TitleScreen extends Screen {
  private choice: TitanChoice;
  private loc = 0;
  private pendingSeed: number;
  private readonly locations: Location[];

  constructor(parent: HTMLElement, private readonly o: TitleOptions) {
    super(parent, 'title-screen');
    this.choice = { ...o.choice };
    this.pendingSeed = o.openSeed ?? randomSeed();
    const base = import.meta.env.BASE_URL;
    this.locations = [
      ...o.maps.map((m) => ({ id: m.id, name: m.name, blurb: m.blurb, img: `${base}maps/${m.id}.png` })),
      { id: 'open', name: 'Open world', blurb: 'An invented world of towns, rivers and mountains, new every game.', img: null },
    ];
    this.loc = Math.max(0, this.locations.findIndex((l) => (l.id === 'open' ? o.currentMap === null : l.id === o.currentMap)));

    this.el.innerHTML = `
      <div class="title-panel">
        <header class="title-brand">
          ${LOGO_MARK}
          <h1 class="title-logo">TITANS<br>UNLEASHED</h1>
          <p class="title-tagline">A city. A titan. No mercy.</p>
        </header>
        <div class="title-actions">
          <button type="button" class="title-btn primary" data-act="start"></button>
          <button type="button" class="title-btn" data-act="controls" aria-expanded="false">Controls</button>
          <div class="title-controls" hidden>${controlsHtml()}</div>
        </div>

        <section class="title-pick" aria-label="Location">
          <h2>Location</h2>
          <div class="picker">
            <button type="button" class="pick-arrow" data-loc="-1" aria-label="Previous location">‹</button>
            <div class="pick-body">
              <img class="pick-preview" data-role="loc-img" alt="">
              <div class="pick-text">
                <p class="pick-name"><span data-role="loc-name"></span> <small data-role="loc-count"></small></p>
                <p class="pick-blurb" data-role="loc-blurb"></p>
                <button type="button" class="pick-link" data-act="reroll" hidden>↻ New world</button>
              </div>
            </div>
            <button type="button" class="pick-arrow" data-loc="1" aria-label="Next location">›</button>
          </div>
        </section>

        <section class="title-pick" aria-label="Titan">
          <h2>Titan</h2>
          <div class="picker">
            <button type="button" class="pick-arrow" data-titan="-1" aria-label="Previous titan">‹</button>
            <div class="pick-text">
              <p class="pick-name"><span data-role="titan-name"></span> <small data-role="titan-count"></small></p>
              <p class="pick-blurb" data-role="titan-blurb"></p>
            </div>
            <button type="button" class="pick-arrow" data-titan="1" aria-label="Next titan">›</button>
          </div>
          <div class="swatches" role="radiogroup" aria-label="Colors"></div>
          <p class="swatch-name" data-role="color-name"></p>
        </section>

        <footer class="title-foot">
          <p>Single player · no account · nothing is saved</p>
          ${o.credits ? `<p>Map data ${o.credits}</p>` : ''}
          <p class="pause-hint">Esc pauses · F1 debug</p>
        </footer>
      </div>`;

    const q = <T extends Element>(sel: string) => this.el.querySelector<T>(sel)!;
    q<HTMLButtonElement>('[data-act=start]').addEventListener('click', () => this.start());
    const controlsBtn = q<HTMLButtonElement>('[data-act=controls]');
    controlsBtn.addEventListener('click', () => {
      const panel = q<HTMLDivElement>('.title-controls');
      panel.hidden = !panel.hidden;
      controlsBtn.setAttribute('aria-expanded', String(!panel.hidden));
    });
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-loc]')) {
      b.addEventListener('click', () => {
        this.loc = (this.loc + Number(b.dataset['loc']) + this.locations.length) % this.locations.length;
        this.renderLocation();
      });
    }
    q<HTMLButtonElement>('[data-act=reroll]').addEventListener('click', () => {
      this.pendingSeed = randomSeed();
      this.renderLocation();
    });
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-titan]')) {
      b.addEventListener('click', () => {
        const i = ROSTER.findIndex((t) => t.id === this.choice.titan);
        const next = ROSTER[(i + Number(b.dataset['titan']) + ROSTER.length) % ROSTER.length]!;
        this.setChoice({ titan: next.id, color: 0 });
      });
    }
    this.renderLocation();
    this.renderTitan();
    this.visible = true;
  }

  private get location(): Location {
    return this.locations[this.loc]!;
  }

  /** Does the main button play the loaded world, or travel to another one? */
  private get isLoaded(): boolean {
    const l = this.location;
    return l.id === 'open' ? this.o.currentMap === null && this.pendingSeed === this.o.openSeed : l.id === this.o.currentMap;
  }

  private start(): void {
    if (this.isLoaded) return this.o.onStart();
    const l = this.location;
    reloadWith(l.id === 'open' ? { map: 'open', seed: String(this.pendingSeed) } : { map: l.id });
  }

  private renderLocation(): void {
    const l = this.location;
    const set = (role: string, text: string) => (this.el.querySelector(`[data-role=${role}]`)!.textContent = text);
    set('loc-name', l.id === 'open' ? `Open world #${this.pendingSeed}` : l.name);
    set('loc-count', `${this.loc + 1}/${this.locations.length}`);
    set('loc-blurb', l.blurb);
    const img = this.el.querySelector<HTMLImageElement>('[data-role=loc-img]')!;
    img.alt = `Top view of ${l.name}`;
    if (l.img) img.src = l.img;
    else {
      img.removeAttribute('src');
      const seed = this.pendingSeed;
      setTimeout(() => {
        if (this.location.id === 'open' && this.pendingSeed === seed) img.src = openWorldPreview(160, seed);
      }, 0);
    }
    this.el.querySelector<HTMLButtonElement>('[data-act=reroll]')!.hidden = l.id !== 'open';
    const start = this.el.querySelector<HTMLButtonElement>('[data-act=start]')!;
    start.textContent = this.isLoaded ? 'Begin the rampage' : `Travel to ${l.id === 'open' ? 'a new world' : l.name}`;
  }

  private setChoice(choice: TitanChoice): void {
    this.choice = choice;
    this.renderTitan();
    this.o.onTitan(choice);
  }

  private renderTitan(): void {
    const t = rosterTitan(this.choice.titan);
    const set = (role: string, text: string) => (this.el.querySelector(`[data-role=${role}]`)!.textContent = text);
    set('titan-name', t.name);
    set('titan-count', `${ROSTER.indexOf(t) + 1}/${ROSTER.length}`);
    set('titan-blurb', t.blurb);
    set('color-name', t.colors[this.choice.color]?.name ?? '');
    const sw = this.el.querySelector<HTMLDivElement>('.swatches')!;
    sw.innerHTML = t.colors
      .map((c, i) => `<button type="button" class="swatch" role="radio" aria-checked="${i === this.choice.color}" aria-label="${c.name}" title="${c.name}"
          data-color="${i}" style="--skin:${hex(c.palette.skin)};--glow:${hex(c.glow)}"></button>`)
      .join('');
    for (const b of sw.querySelectorAll<HTMLButtonElement>('[data-color]')) {
      b.addEventListener('click', () => this.setChoice({ titan: this.choice.titan, color: Number(b.dataset['color']) }));
    }
  }
}

/** Esc / focus loss. */
export class PauseMenu extends Screen {
  private readonly statsEl: HTMLDivElement;

  constructor(parent: HTMLElement, credits: string | null, onResume: () => void, onNewGame: () => void) {
    super(parent, 'pause-screen');
    this.el.innerHTML = `
      <div class="menu-card">
        <h1 class="menu-title small">PAUSED</h1>
        <div class="menu-row">
          <button class="menu-primary" data-act="resume" type="button">Resume</button>
          <button class="menu-secondary" data-act="new" type="button">New game</button>
        </div>
        <div class="menu-cols"><div class="menu-stats-slot"></div><div>${controlsHtml()}</div></div>
        ${credits ? `<p class="menu-credits">Map data ${credits}</p>` : ''}
      </div>`;
    this.statsEl = this.el.querySelector('.menu-stats-slot')!;
    this.el.querySelector('[data-act=resume]')!.addEventListener('click', onResume);
    this.el.querySelector('[data-act=new]')!.addEventListener('click', onNewGame);
  }

  show(stats: RunStats): void {
    this.statsEl.innerHTML = statsHtml(stats);
    this.visible = true;
  }
}

/** Defeat: respawn (keeps the run) or start over. */
export class GameOverScreen extends Screen {
  private readonly statsEl: HTMLDivElement;

  constructor(parent: HTMLElement, onRespawn: () => void, onNewGame: () => void) {
    super(parent, 'gameover-screen');
    this.el.innerHTML = `
      <div class="menu-card">
        <h1 class="menu-title danger">DEFEATED</h1>
        <div class="menu-stats-slot"></div>
        <div class="menu-row">
          <button class="menu-primary" data-act="respawn" type="button">Respawn</button>
          <button class="menu-secondary" data-act="new" type="button">New game</button>
        </div>
        <p class="pause-hint">Enter to respawn</p>
      </div>`;
    this.statsEl = this.el.querySelector('.menu-stats-slot')!;
    this.el.querySelector('[data-act=respawn]')!.addEventListener('click', onRespawn);
    this.el.querySelector('[data-act=new]')!.addEventListener('click', onNewGame);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.isVisible) onRespawn();
    });
  }

  show(stats: RunStats): void {
    this.statsEl.innerHTML = statsHtml(stats);
    this.visible = true;
  }
}
