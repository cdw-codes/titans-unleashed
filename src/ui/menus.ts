import { ACTION_LABELS, BINDINGS } from '../config/input';
import { ACTIONS, codeLabel } from '../input/actions';

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

/** First screen: title, controls, Start. */
export class TitleScreen extends Screen {
  /**
   * `maps`: real cities to pick from (plus the procedural open world); picking one
   * reloads the page with ?map=<id>. `current` is the loaded map id (null = open world).
   */
  constructor(parent: HTMLElement, maps: { id: string; name: string }[], current: string | null, credits: string | null, onStart: () => void) {
    super(parent, 'title-screen');
    const choices = [...maps, { id: 'open', name: 'Open world' }]
      .map((m) => `<button type="button" class="menu-choice${(m.id === 'open' ? current === null : m.id === current) ? ' active' : ''}" data-map="${m.id}">${m.name}</button>`)
      .join('');
    this.el.innerHTML = `
      <div class="menu-card">
        <p class="menu-kicker">A city. A monster. No mercy.</p>
        <h1 class="menu-title">TITANS UNLEASHED</h1>
        <div class="menu-row menu-maps">${choices}</div>
        <button class="menu-primary" data-act="start" type="button">Begin the rampage</button>
        <div class="title-controls">${controlsHtml()}</div>
        <p class="pause-hint">Esc pauses · F1 debug</p>
        ${credits ? `<p class="menu-credits">Map data ${credits}</p>` : ''}
      </div>`;
    this.el.querySelector('[data-act=start]')!.addEventListener('click', onStart);
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-map]')) {
      b.addEventListener('click', () => {
        if (b.classList.contains('active')) return;
        const q = new URLSearchParams(location.search);
        q.set('map', b.dataset['map']!);
        location.search = q.toString();
      });
    }
    this.visible = true;
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
