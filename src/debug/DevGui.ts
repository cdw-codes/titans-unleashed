import type GUI from 'lil-gui';
import type { Game } from '../core/Game';
import { QUALITY_LEVELS } from '../config/quality';
import { ENVIRONMENT } from '../config/environment';
import { autoRange, getPath, numericPaths, setPath, TUNABLES, type Tunable } from './tunables';

/**
 * Dev-only panel (dynamic import, never in production builds).
 * Tuning: sliders for every numeric config value. "Save as base" writes the
 * changed values into src/config/*.ts through the dev server (the page then
 * reloads with them as defaults); "Copy changes" puts them on the clipboard.
 */
export async function createDevGui(game: Game): Promise<GUI> {
  const { default: LilGui } = await import('lil-gui');
  const gui = new LilGui({ title: 'Dev' });
  gui.close();

  const state = {
    quality: game.qualityLevel,
    spawnCrates: () => game.spawnTestCrates(25),
    hurt: () => game.hurtPlayer(60),
    heavy: () => game.hurtPlayer(300),
    kill: () => game.hurtPlayer(1e6),
    energy: () => game.fillEnergy(),
    encounter: () => game.startEncounter(),
    thornmaw: () => game.spawnRival('thornmaw'),
    vesperion: () => game.spawnRival('vesperion'),
    defeatRival: () => game.defeatRival(),
    raiseThreat: () => game.raiseThreat(),
    calm: () => {
      game.threat.heat = 0;
    },
    evolve: () => game.offerEvolution(),
    pulse: () => game.grantUpgrade('pulse'),
  };
  gui.add(state, 'quality', QUALITY_LEVELS).name('Quality preset').onChange((v: typeof state.quality) => game.setQuality(v));
  gui.add(game.loop, 'timeScale', 0.05, 2, 0.05).name('Time scale');
  const dbg = gui.addFolder('Debug view').close();
  dbg.add(game.debug, 'showColliders').name('Colliders');
  dbg.add(game.debug, 'showChunks').name('Chunk grid');
  dbg.add(state, 'spawnCrates').name('Drop 25 crates');
  dbg.add(state, 'energy').name('Fill energy');
  dbg.add(state, 'hurt').name('Hit player (60)');
  dbg.add(state, 'heavy').name('Heavy hit (knockdown)');
  dbg.add(state, 'kill').name('Defeat player');
  const enc = gui.addFolder('Encounters').close();
  enc.add(state, 'encounter').name('Start encounter now');
  enc.add(state, 'thornmaw').name('Spawn Thornmaw (300 m)');
  enc.add(state, 'vesperion').name('Spawn Vesperion (300 m)');
  enc.add(state, 'defeatRival').name('Defeat rival');
  const mil = gui.addFolder('Military & upgrades').close();
  mil.add(state, 'raiseThreat').name('Threat +1 star');
  mil.add(state, 'calm').name('Threat to 0');
  mil.add(state, 'evolve').name('Offer evolution');
  mil.add(state, 'pulse').name('Unlock Atomic Pulse');

  createTuning(gui, game);
  return gui;
}

function createTuning(gui: GUI, game: Game): void {
  const tuning = gui.addFolder('Tuning');
  // Values as loaded from the config files: the baseline for "changed".
  const baseline = new Map<Tunable, Map<string, number>>();
  for (const t of TUNABLES) {
    baseline.set(t, new Map(numericPaths(t.obj, t.exclude).map((p) => [p, getPath(t.obj, p)])));
  }

  const changes = () => {
    const out: { file: string; exportName: string; values: Record<string, number> }[] = [];
    for (const t of TUNABLES) {
      const values: Record<string, number> = {};
      for (const [p, v0] of baseline.get(t)!) {
        const v = getPath(t.obj, p);
        if (v !== v0) values[p] = v;
      }
      if (Object.keys(values).length) out.push({ file: t.file, exportName: t.exportName, values });
    }
    return out;
  };

  const status = { text: 'no changes' };
  const refreshStatus = () => {
    const n = changes().reduce((sum, c) => sum + Object.keys(c.values).length, 0);
    status.text = n ? `${n} unsaved change${n > 1 ? 's' : ''}` : 'no changes';
    statusCtrl.updateDisplay();
  };

  const actions = {
    save: async () => {
      const body = changes();
      if (!body.length) return;
      status.text = 'saving…';
      statusCtrl.updateDisplay();
      try {
        const res = await fetch('/__tuning/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Kaiju-Tuning': '1' },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { applied?: string[]; skipped?: string[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        status.text = `saved ${json.applied?.length ?? 0}${json.skipped?.length ? `, skipped ${json.skipped.join(', ')}` : ''}`;
        console.info('[tuning] saved', json);
        // Vite reloads the page when the config files change.
      } catch (err) {
        status.text = `save failed: ${String(err)}`;
      }
      statusCtrl.updateDisplay();
    },
    copy: async () => {
      const text = JSON.stringify(changes(), null, 2);
      console.info('[tuning] changes\n' + text);
      try {
        await navigator.clipboard.writeText(text);
        status.text = 'copied to clipboard';
      } catch {
        status.text = 'clipboard blocked: see console';
      }
      statusCtrl.updateDisplay();
    },
    reset: () => {
      for (const t of TUNABLES) for (const [p, v] of baseline.get(t)!) setPath(t.obj, p, v);
      for (const c of tuning.controllersRecursive()) c.updateDisplay();
      game.environment.setSunAngles(ENVIRONMENT.sunElevation, ENVIRONMENT.sunAzimuth);
      refreshStatus();
    },
  };

  tuning.add(actions, 'save').name('💾 Save as base (writes src/config)');
  tuning.add(actions, 'copy').name('📋 Copy changes (JSON)');
  tuning.add(actions, 'reset').name('↺ Reset to file values');
  const statusCtrl = tuning.add(status, 'text').name('Status').disable();

  for (const t of TUNABLES) {
    const folder = tuning.addFolder(t.reloadOnly ? `${t.folder} ⟳` : t.folder).close();
    const sub = new Map<string, GUI>();
    for (const path of baseline.get(t)!.keys()) {
      const keys = path.split('.');
      let parent = folder;
      for (let i = 0; i < keys.length - 1; i++) {
        const prefix = keys.slice(0, i + 1).join('.');
        if (!sub.has(prefix)) sub.set(prefix, parent.addFolder(keys[i]!).close());
        parent = sub.get(prefix)!;
      }
      const holder = keys.slice(0, -1).reduce<Record<string, number>>((o, k) => o[k] as unknown as Record<string, number>, t.obj as Record<string, number>);
      const key = keys[keys.length - 1]!;
      const [min, max, step] = t.ranges?.[path] ?? autoRange(holder[key]!);
      parent
        .add(holder, key, min, max, step)
        .onChange(() => {
          if (t.exportName === 'ENVIRONMENT') applyEnvironment(game);
          refreshStatus();
        });
    }
  }
  if (TUNABLES.some((t) => t.reloadOnly)) {
    tuning.add({ note: '⟳ = applies after Save (page reloads)' }, 'note').name('Note').disable();
  }
}

/** Environment values that can be applied live; the rest need a reload. */
function applyEnvironment(game: Game): void {
  game.environment.setSunAngles(ENVIRONMENT.sunElevation, ENVIRONMENT.sunAzimuth);
  game.environment.sun.intensity = ENVIRONMENT.sunIntensity;
}
