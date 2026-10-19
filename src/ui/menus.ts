import { ACTION_LABELS, BINDINGS } from '../config/input';
import { ACTIONS, codeLabel } from '../input/actions';
import { randomSeed, reloadWith, type CityMapDef } from '../config/maps';
import { ROSTER, rosterTitan, type TitanChoice } from '../entities/titan/roster';
import { RATING_KEYS } from '../entities/titan/profiles';
import { openWorldPreview } from './openWorldPreview';
import logoSvg from './logo.svg?raw';
import { parseRoomCode } from '../net/protocol';
import { CITY } from '../config/city';
import { bboxLatLon, bboxUv, formatDrop, openUv, openWorld, type Uv } from '../world/dropPoint';

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
  versus: VersusOptions;
  drop: DropOptions;
}

export interface DropOptions {
  /** The loaded world's drop point on its preview. */
  current: Uv;
  /** Move the drop point in the loaded world; returns where it actually landed (dry ground). */
  onDrop(uv: Uv): Uv;
}

export interface VersusOptions {
  /** Joined at boot through an invite (?room=): the world is the host's. */
  joined: boolean;
  name: string;
  onName(name: string): void;
  /** Open a room for this world (resolves when it is open, throws a readable error). */
  onHost(): Promise<void>;
  /** Join by code (reloads into the host's world). */
  onJoin(code: string): void;
  onLeave(): void;
}

/** What the title screen shows about the current room. */
export interface RoomView {
  code: string;
  link: string;
  isHost: boolean;
  myId: number;
  players: { id: number; name: string; titan: string; kos: number }[];
}

interface Location {
  id: string;
  name: string;
  blurb: string;
  img: string | null;
  /** City bbox (the preview's extent) and default spawn; null for the open world. */
  bbox: readonly [number, number, number, number] | null;
  spawn: Uv;
}

/** Logo mark: the titan dorsal plates artwork (src/ui/logo.svg), cropped to the plates. */
const LOGO_MARK = logoSvg;

/** A seismograph trace: calm with a few jolts (static; the strip scrolls in CSS). */
function seismicPoints(): string {
  const pts: string[] = [];
  for (let x = 0; x <= 400; x += 4) {
    const jolt = Math.exp(-(((x % 200) - 120) ** 2) / 300) * 9;
    const y = 12 + Math.sin(x * 0.9) * (1.2 + jolt) + Math.sin(x * 2.3) * 0.8;
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

/** A heartbeat-like trace for the specimen dossier. */
function signaturePoints(): string {
  const pts: string[] = [];
  for (let x = 0; x <= 200; x += 2) {
    const k = x % 50;
    const y = k > 20 && k < 30 ? 10 - Math.sin(((k - 20) / 10) * Math.PI * 2) * 8 : 10 + Math.sin(x * 0.7) * 0.6;
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

const latLon = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;

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
    this.loadedDrop = o.drop.current;
    this.pendingSeed = o.openSeed ?? randomSeed();
    const base = import.meta.env.BASE_URL;
    this.locations = [
      ...o.maps.map((m) => ({ id: m.id, name: m.name, blurb: m.blurb, img: `${base}maps/${m.id}.png`, bbox: m.bbox, spawn: bboxUv(m.bbox, m.spawn[0], m.spawn[1]) })),
      { id: 'open', name: 'Open world', blurb: 'An invented world of towns, rivers and mountains, new every game.', img: null, bbox: null, spawn: openUv(CITY.spawnX, CITY.spawnZ) },
    ];
    this.loc = Math.max(0, this.locations.findIndex((l) => (l.id === 'open' ? o.currentMap === null : l.id === o.currentMap)));

    this.el.innerHTML = `
      <div class="tt-frame" aria-hidden="true">
        <div class="tt-scan"></div>
        <i class="tt-corner tl"></i><i class="tt-corner tr"></i><i class="tt-corner bl"></i><i class="tt-corner br"></i>
        <div class="tt-topbar">
          <span class="tt-live"><i></i>LIVE FEED</span>
          <span>TITAN OBSERVATION NETWORK</span>
          <span class="tt-dim">FIELD TERMINAL 07</span>
          <span class="tt-push" data-role="clock">UTC --:--:--</span>
        </div>
        <div class="tt-track" data-role="track" hidden>
          <div class="tt-track-box"><i></i><i></i><i></i><i></i></div>
          <dl class="tt-track-label">
            <dt>SUBJECT</dt><dd data-role="track-name"></dd>
            <dt>CLASS</dt><dd>TITAN</dd>
            <dt>HEIGHT</dt><dd data-role="track-height"></dd>
            <dt>WEIGHT</dt><dd data-role="track-weight"></dd>
            <dt>STATUS</dt><dd class="tt-warn">DORMANT</dd>
          </dl>
        </div>
        <div class="tt-bottombar">
          <span class="tt-dim">SEISMIC</span>
          <div class="tt-wave"><svg viewBox="0 0 400 24" preserveAspectRatio="none"><polyline points="${seismicPoints()}"/></svg></div>
          <span data-role="coords"></span>
        </div>
      </div>

      <div class="title-panel">
        <header class="title-brand">
          ${LOGO_MARK}
          <h1 class="title-logo">TITANS<br>UNLEASHED</h1>
          <p class="title-tagline">A city. A titan. No mercy.</p>
        </header>

        <section class="tt-module" aria-label="Location">
          <h2><span class="tt-idx">01</span>Target zone<span class="tt-count" data-role="loc-count"></span></h2>
          <div class="tt-zone">
            <button type="button" class="pick-arrow" data-loc="-1" aria-label="Previous location">‹</button>
            <figure class="tt-scope">
              <span class="tt-scope-grid"></span><span class="tt-sweep"></span>
              <div class="tt-map" data-role="drop-map" title="Click or drag to set the drop point">
                <img data-role="loc-img" alt="" draggable="false">
                <span class="tt-pin" data-role="drop-pin"></span>
              </div>
              <figcaption data-role="loc-coords"></figcaption>
              <span class="tt-scope-hint" data-role="drop-hint">SET DROP POINT</span>
            </figure>
            <button type="button" class="pick-arrow" data-loc="1" aria-label="Next location">›</button>
          </div>
          <p class="pick-name" data-role="loc-name"></p>
          <p class="pick-blurb" data-role="loc-blurb"></p>
          <button type="button" class="pick-link" data-act="reroll" hidden>↻ Scan a new world</button>
        </section>

        <section class="tt-module" aria-label="Titan">
          <h2><span class="tt-idx">02</span>Specimen<span class="tt-count" data-role="titan-count"></span></h2>
          <div class="tt-zone">
            <button type="button" class="pick-arrow" data-titan="-1" aria-label="Previous titan">‹</button>
            <div class="tt-dossier">
              <p class="tt-code" data-role="titan-code"></p>
              <p class="pick-name" data-role="titan-name"></p>
            </div>
            <button type="button" class="pick-arrow" data-titan="1" aria-label="Next titan">›</button>
          </div>
          <p class="pick-blurb" data-role="titan-blurb"></p>
          <dl class="tt-measure">
            <div><dt>Height</dt><dd data-role="t-height"></dd></div>
            <div><dt>Length</dt><dd data-role="t-length"></dd></div>
            <div><dt>Weight</dt><dd data-role="t-weight"></dd></div>
          </dl>
          <dl class="tt-file">
            <dt>Class</dt><dd data-role="t-class"></dd>
            <dt>Origin</dt><dd data-role="t-origin"></dd>
          </dl>
          <div class="tt-ratings" data-role="t-ratings"></div>
          <ul class="tt-traits" data-role="t-traits"></ul>
          <div class="tt-signal"><span class="tt-dim">BIO-SIGNATURE</span><div class="tt-trace"><svg viewBox="0 0 200 20" preserveAspectRatio="none"><polyline points="${signaturePoints()}"/></svg></div></div>
        </section>

        <section class="tt-module" aria-label="Colors">
          <h2><span class="tt-idx">03</span>Spectrum variant<span class="tt-count" data-role="color-name"></span></h2>
          <div class="swatches" role="radiogroup" aria-label="Colors"></div>
        </section>

        <section class="tt-module title-versus" aria-label="Versus">
          <h2><span class="tt-idx">04</span>Uplink · versus<span class="tt-count">max 4 · p2p</span></h2>
          <div data-role="vs-lobby">
            <label class="vs-field"><span>Callsign</span><input data-role="vs-name" maxlength="20" autocomplete="nickname" spellcheck="false"></label>
            <div class="vs-row">
              <button type="button" class="title-btn" data-act="host">Host a room</button>
              <input class="vs-code-input" data-role="vs-code" maxlength="7" placeholder="CODE" aria-label="Room code" autocomplete="off" spellcheck="false">
              <button type="button" class="title-btn" data-act="join">Join</button>
            </div>
          </div>
          <div data-role="vs-room" hidden>
            <div class="vs-row">
              <p class="vs-room-code">Room <strong data-role="vs-code-show"></strong></p>
              <button type="button" class="pick-link" data-act="copy">Copy invite link</button>
              <button type="button" class="pick-link" data-act="leave">Leave</button>
            </div>
            <ul class="vs-players" data-role="vs-players"></ul>
          </div>
          <p class="vs-status" data-role="vs-status" role="status"></p>
        </section>

        <div class="title-actions">
          <button type="button" class="title-btn primary" data-act="start"></button>
          <button type="button" class="pick-link" data-act="controls" aria-expanded="false">Controls</button>
          <div class="title-controls" hidden>${controlsHtml()}</div>
        </div>

        <footer class="title-foot">
          <p>No account · nothing is saved · Esc pauses · F1 debug</p>
          ${o.credits ? `<p>Map data ${o.credits}</p>` : ''}
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
        this.pendingDrop = null;
        this.renderLocation();
      });
    }
    q<HTMLButtonElement>('[data-act=reroll]').addEventListener('click', () => {
      this.pendingSeed = randomSeed();
      this.pendingDrop = null;
      this.renderLocation();
    });
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-titan]')) {
      b.addEventListener('click', () => {
        const i = ROSTER.findIndex((t) => t.id === this.choice.titan);
        const next = ROSTER[(i + Number(b.dataset['titan']) + ROSTER.length) % ROSTER.length]!;
        this.setChoice({ titan: next.id, color: 0 });
      });
    }
    this.bindVersus();
    this.bindDrop();
    this.renderLocation();
    this.renderTitan();
    this.visible = true;
    const clock = q('[data-role=clock]');
    const tick = () => {
      if (this.isVisible) clock.textContent = `UTC ${new Date().toISOString().slice(11, 19)}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  /**
   * Tracking box around the titan in the live scene (screen pixels: center x,
   * head and feet y), or null to hide it (narrow screens).
   */
  track(box: { x: number; top: number; bottom: number } | null): void {
    const el = this.el.querySelector<HTMLDivElement>('[data-role=track]')!;
    el.hidden = !box;
    if (!box) return;
    const h = Math.max(40, box.bottom - box.top);
    el.style.setProperty('--tx', `${box.x}px`);
    el.style.setProperty('--ty', `${box.top}px`);
    el.style.setProperty('--th', `${h}px`);
    el.style.setProperty('--tw', `${h * 0.62}px`);
  }

  private room: RoomView | null = null;
  /** Drop point picked for a location that isn't loaded yet (applied on travel). */
  private pendingDrop: Uv | null = null;
  private loadedDrop: Uv;

  /** Drop point shown for the selected location. */
  private get drop(): Uv {
    if (this.isLoaded) return this.loadedDrop;
    return this.pendingDrop ?? this.location.spawn;
  }

  private bindDrop(): void {
    const map = this.el.querySelector<HTMLDivElement>('[data-role=drop-map]')!;
    const img = map.querySelector('img')!;
    // The map frame takes the image's aspect so fractions are fractions of the map.
    img.addEventListener('load', () => map.style.setProperty('--ar', String(img.naturalWidth / img.naturalHeight)));
    const at = (e: PointerEvent): Uv => {
      const r = map.getBoundingClientRect();
      return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
    };
    let dragging = false;
    map.addEventListener('pointerdown', (e) => {
      if (this.room) return;
      dragging = true;
      map.setPointerCapture(e.pointerId);
      this.showDrop(at(e));
    });
    map.addEventListener('pointermove', (e) => {
      if (dragging) this.showDrop(at(e));
    });
    const commit = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const uv = at(e);
      if (this.isLoaded) this.loadedDrop = this.o.drop.onDrop(uv);
      else this.pendingDrop = uv;
      this.showDrop(this.drop);
    };
    map.addEventListener('pointerup', commit);
    map.addEventListener('pointercancel', commit);
  }

  /** Pin and coordinates for a drop point on the selected location. */
  private showDrop(uv: Uv): void {
    const pin = this.el.querySelector<HTMLSpanElement>('[data-role=drop-pin]')!;
    pin.style.left = `${uv[0] * 100}%`;
    pin.style.top = `${uv[1] * 100}%`;
    const coords = this.coordsText(uv);
    this.el.querySelector('[data-role=loc-coords]')!.textContent = coords;
    if (this.isLoaded) this.el.querySelector('[data-role=coords]')!.textContent = coords;
  }

  private coordsText(uv: Uv): string {
    const bbox = this.location.bbox;
    if (bbox) return latLon(...bboxLatLon(bbox, uv));
    const [x, z] = openWorld(uv);
    const km = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n / 1000).toFixed(1)}`;
    return `GRID ${km(x)} / ${km(-z)} KM · SEED ${String(this.pendingSeed).padStart(5, '0')}`;
  }

  private bindVersus(): void {
    const v = this.o.versus;
    const q = <T extends Element>(sel: string) => this.el.querySelector<T>(sel)!;
    const name = q<HTMLInputElement>('[data-role=vs-name]');
    name.value = v.name;
    name.addEventListener('change', () => v.onName(name.value.trim().slice(0, 20) || v.name));
    const code = q<HTMLInputElement>('[data-role=vs-code]');
    const host = q<HTMLButtonElement>('[data-act=host]');
    host.addEventListener('click', () => {
      host.disabled = true;
      this.setVersusStatus('Opening a room…');
      v.onHost().then(
        () => this.setVersusStatus('Share the code or the invite link. Begin whenever you like; others can join any time.'),
        (err: Error) => {
          host.disabled = false;
          this.setVersusStatus(err.message);
        },
      );
    });
    const join = () => {
      const c = parseRoomCode(code.value);
      if (!c) return this.setVersusStatus('A room code is 5 letters and digits.');
      this.setVersusStatus('Joining…');
      v.onJoin(c);
    };
    q<HTMLButtonElement>('[data-act=join]').addEventListener('click', join);
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
    });
    q<HTMLButtonElement>('[data-act=copy]').addEventListener('click', () => {
      if (!this.room) return;
      navigator.clipboard.writeText(this.room.link).then(
        () => this.setVersusStatus('Invite link copied.'),
        () => this.setVersusStatus(this.room?.link ?? ''),
      );
    });
    q<HTMLButtonElement>('[data-act=leave]').addEventListener('click', () => v.onLeave());
  }

  setVersusStatus(text: string): void {
    this.el.querySelector('[data-role=vs-status]')!.textContent = text;
  }

  /** Show the room (or the lobby when null). In a room the location is fixed. */
  setRoom(room: RoomView | null): void {
    this.room = room;
    const q = <T extends HTMLElement>(sel: string) => this.el.querySelector<T>(sel)!;
    q('[data-role=vs-lobby]').hidden = !!room;
    q('[data-role=vs-room]').hidden = !room;
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-loc], [data-act=reroll]')) b.disabled = !!room;
    if (room) {
      q('[data-role=vs-code-show]').textContent = room.code;
      const list = q('[data-role=vs-players]');
      list.replaceChildren(
        ...room.players.map((p) => {
          const li = document.createElement('li');
          li.textContent = `${p.name}${p.id === room.myId ? ' (you)' : ''}${p.id === 0 ? ' · host' : ''}`;
          return li;
        }),
      );
    }
    this.renderLocation();
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
    if (this.isLoaded || this.room) return this.o.onStart();
    const l = this.location;
    const spawn = this.pendingDrop ? formatDrop(this.pendingDrop) : '';
    reloadWith(l.id === 'open' ? { map: 'open', seed: String(this.pendingSeed), spawn } : { map: l.id, spawn });
  }

  private renderLocation(): void {
    const l = this.location;
    const set = (role: string, text: string) => (this.el.querySelector(`[data-role=${role}]`)!.textContent = text);
    set('loc-name', l.id === 'open' ? `Open world #${this.pendingSeed}` : l.name);
    set('loc-count', `${this.loc + 1}/${this.locations.length}`);
    set('loc-blurb', l.blurb);
    this.showDrop(this.drop);
    this.el.querySelector<HTMLElement>('[data-role=drop-hint]')!.hidden = !!this.room;
    const img = this.el.querySelector<HTMLImageElement>('[data-role=loc-img]')!;
    img.alt = `Top view of ${l.name}`;
    if (l.img) img.src = l.img;
    else {
      img.removeAttribute('src');
      const seed = this.pendingSeed;
      setTimeout(() => {
        if (this.location.id === 'open' && this.pendingSeed === seed) img.src = openWorldPreview(240, seed);
      }, 0);
    }
    this.el.querySelector<HTMLButtonElement>('[data-act=reroll]')!.hidden = l.id !== 'open';
    const start = this.el.querySelector<HTMLButtonElement>('[data-act=start]')!;
    start.textContent = this.room ? 'Enter the fight' : this.isLoaded ? 'Begin the rampage' : `Travel to ${l.id === 'open' ? 'a new world' : l.name}`;
  }

  private setChoice(choice: TitanChoice): void {
    this.choice = choice;
    this.renderTitan();
    this.o.onTitan(choice);
  }

  private renderTitan(): void {
    const t = rosterTitan(this.choice.titan);
    const set = (role: string, text: string) => (this.el.querySelector(`[data-role=${role}]`)!.textContent = text);
    // "Titanus" as a small genus line over the species name, so long names fit.
    const [genus, ...species] = t.name.split(' ');
    const nameEl = this.el.querySelector('[data-role=titan-name]')!;
    const g = document.createElement('small');
    g.textContent = genus ?? '';
    nameEl.replaceChildren(g, species.join(' '));
    set('titan-code', `TN-${String(ROSTER.indexOf(t) + 1).padStart(2, '0')} · ${t.epithet.toUpperCase()}`);
    set('track-name', t.name.toUpperCase());
    set('titan-count', `${ROSTER.indexOf(t) + 1}/${ROSTER.length}`);
    set('titan-blurb', t.blurb);
    const pr = t.profile;
    const tonnes = `${pr.weight.toLocaleString('en-US')} T`;
    set('t-height', `${pr.height} M`);
    set('t-length', `${pr.length} M`);
    set('t-weight', tonnes);
    set('t-class', pr.classification);
    set('t-origin', pr.origin);
    set('track-height', `${pr.height} M`);
    set('track-weight', tonnes);
    const ratings = this.el.querySelector('[data-role=t-ratings]')!;
    ratings.replaceChildren(
      ...RATING_KEYS.map((k) => {
        const row = document.createElement('div');
        row.className = 'tt-rating';
        row.setAttribute('aria-label', `${k} ${pr.ratings[k]} of 5`);
        const label = document.createElement('span');
        label.textContent = k;
        const bar = document.createElement('span');
        bar.className = 'tt-bar';
        for (let i = 1; i <= 5; i++) {
          const seg = document.createElement('i');
          if (i <= pr.ratings[k]) seg.className = 'on';
          bar.appendChild(seg);
        }
        row.append(label, bar);
        return row;
      }),
    );
    this.el.querySelector('[data-role=t-traits]')!.replaceChildren(
      ...pr.abilities.map((a) => {
        const li = document.createElement('li');
        li.textContent = a;
        return li;
      }),
    );
    set('color-name', t.colors[this.choice.color]?.name ?? '');
    const sw = this.el.querySelector<HTMLDivElement>('.swatches')!;
    sw.innerHTML = t.colors
      .map((c, i) => `<button type="button" class="swatch" role="radio" aria-checked="${i === this.choice.color}" aria-label="${c.name}" title="${c.name}"
          data-color="${i}" style="--skin:${hex(c.palette.skin)};--glow:${hex(c.glow)}"><span>${String.fromCharCode(65 + i)}</span></button>`)
      .join('');
    // The dossier trace and tracker take the variant's glow.
    this.el.style.setProperty('--sig', hex(t.colors[this.choice.color]?.glow ?? 0x58d8ff));
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
