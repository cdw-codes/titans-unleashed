import type GUI from 'lil-gui';
import type { Game } from '../core/Game';
import { QUALITY_LEVELS } from '../config/quality';
import { ENVIRONMENT } from '../config/environment';

/** Dev-only tuning panel. Loaded via dynamic import so it never ships in production. */
export async function createDevGui(game: Game): Promise<GUI> {
  const { default: LilGui } = await import('lil-gui');
  const gui = new LilGui({ title: 'Dev' });
  gui.close();

  const state = {
    quality: game.qualityLevel,
    sunElevation: ENVIRONMENT.sunElevation,
    sunAzimuth: ENVIRONMENT.sunAzimuth,
    spawnCrates: () => game.spawnTestCrates(25),
  };

  gui.add(state, 'quality', QUALITY_LEVELS).name('Quality preset').onChange((v: typeof state.quality) => game.setQuality(v));
  gui.add(game.loop, 'timeScale', 0.05, 2, 0.05).name('Time scale');

  const dbg = gui.addFolder('Debug view');
  dbg.add(game.debug, 'showColliders').name('Colliders');
  dbg.add(game.debug, 'showChunks').name('Chunk grid');

  const sun = gui.addFolder('Sun');
  const updateSun = () => game.environment.setSunAngles(state.sunElevation, state.sunAzimuth);
  sun.add(state, 'sunElevation', 5, 85, 1).name('Elevation').onChange(updateSun);
  sun.add(state, 'sunAzimuth', 0, 360, 1).name('Azimuth').onChange(updateSun);
  sun.add(game.environment.sun, 'intensity', 0, 6, 0.1).name('Intensity');

  gui.addFolder('Physics test').add(state, 'spawnCrates').name('Drop 25 crates');
  return gui;
}
