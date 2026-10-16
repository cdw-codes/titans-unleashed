import type GUI from 'lil-gui';
import type { Game } from '../core/Game';
import { QUALITY_LEVELS } from '../config/quality';
import { ENVIRONMENT } from '../config/environment';
import { KAIJU_FEEDBACK, KAIJU_GAIT, KAIJU_MOVEMENT } from '../config/kaiju';
import { CAMERA, SHAKE } from '../config/camera';
import { DUST } from '../config/effects';
import { DESTRUCTION } from '../config/destruction';

/** Dev-only: let lil-gui write into the (readonly-typed) config objects. Changes reset on reload. */
const live = <T extends object>(o: T) => o as { -readonly [K in keyof T]: T[K] };

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

  // Live tuning. Copy values you like back into src/config/*.ts.
  const mv = gui.addFolder('Kaiju movement').close();
  const M = live(KAIJU_MOVEMENT);
  mv.add(M, 'walkSpeed', 2, 30, 0.5);
  mv.add(M, 'sprintSpeed', 5, 50, 0.5);
  mv.add(M, 'acceleration', 0.5, 20, 0.1);
  mv.add(M, 'sprintAcceleration', 0.5, 20, 0.1);
  mv.add(M, 'deceleration', 0.5, 30, 0.1);
  mv.add(M, 'turnRate', 0.1, 4, 0.05);
  mv.add(M, 'sprintTurnRate', 0.1, 4, 0.05);
  mv.add(M, 'turnSlowdown', 0, 1, 0.05);
  const G = live(KAIJU_GAIT);
  mv.add(G, 'walkStride', 10, 80, 1);
  mv.add(G, 'sprintStride', 10, 100, 1);

  const fb = gui.addFolder('Footstep feedback').close();
  const F = live(KAIJU_FEEDBACK);
  fb.add(F, 'walkStepTrauma', 0, 1, 0.01);
  fb.add(F, 'sprintStepTrauma', 0, 1, 0.01);
  fb.add(F, 'walkStepKick', 0, 40, 0.5);
  fb.add(F, 'sprintStepKick', 0, 40, 0.5);
  const S = live(SHAKE);
  fb.add(S, 'maxOffset', 0, 10, 0.1);
  fb.add(S, 'maxRoll', 0, 0.2, 0.005);
  fb.add(S, 'frequency', 1, 30, 0.5);
  fb.add(S, 'decay', 0.2, 5, 0.1);
  fb.add(live(DUST.walkStep), 'opacity', 0, 1, 0.05).name('walk dust opacity');
  fb.add(live(DUST.walkStep), 'count', 0, 40, 1).name('walk dust count');

  const de = gui.addFolder('Destruction').close();
  const D = live(DESTRUCTION);
  de.add(D, 'pushDps', 0, 600, 5);
  de.add(D, 'sprintPushMultiplier', 1, 5, 0.1);
  de.add(D, 'impactDamagePerMps', 0, 40, 0.5);
  de.add(D, 'footstepDamage', 0, 300, 5);
  de.add(D, 'footCrushRadius', 0, 40, 0.5);
  de.add(D, 'hitPauseSeconds', 0, 0.3, 0.01);
  de.add(D, 'collapseTraumaPer100m', 0, 2, 0.05);
  de.add(D, 'debrisPer10m', 0, 8, 0.5);

  const cam = gui.addFolder('Camera').close();
  const C = live(CAMERA);
  cam.add(C, 'distance', 40, 400, 1);
  cam.add(C, 'pivotHeight', 10, 150, 1);
  cam.add(C, 'shoulderOffset', -60, 60, 1);
  cam.add(C, 'followHalfLife', 0, 1, 0.01);
  cam.add(C, 'followHalfLifeY', 0, 1, 0.01);
  cam.add(C, 'fov', 30, 90, 1);
  cam.add(C, 'sprintFovBoost', 0, 20, 0.5);
  return gui;
}
