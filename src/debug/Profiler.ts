import { QUALITY_LEVELS, type QualityLevel } from '../config/quality';
import type { Game } from '../core/Game';
import { yieldToBrowser } from '../core/yieldToBrowser';

export interface ProfileRow {
  preset: QualityLevel;
  simMs: number;
  frameMs: number;
  frameP95: number;
  drawCalls: number;
  trisK: number;
}

/**
 * Dev-only stress profile per quality preset: 5-star military, a rival, the
 * beam firing while walking. Each sample runs two sim ticks (30 FPS cap) and
 * renders, then forces a GPU sync (1-pixel readback) so frame time includes
 * the GPU. Run from the dev panel or `await game.profile()` in the console.
 */
export async function profilePresets(game: Game, frames = 90): Promise<ProfileRow[]> {
  const g = game as unknown as {
    fixedUpdate(dt: number): void;
    renderFrame(a: number, d: number, s: { steps: number; alpha: number; dropped: number }): void;
    input: { state: { press(c: string): void; releaseAll(): void } };
  };
  const renderer = game.render.renderer;
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const wasStopped = { paused: game.loop.paused };
  game.loop.stop();
  game.loop.paused = false;

  // Scenario: high threat, a rival close by, populated military.
  for (let i = 0; i < 5; i++) game.raiseThreat();
  game.spawnRival('vesperion');
  game.fillEnergy();
  for (let i = 0; i < 60 * 12; i++) g.fixedUpdate(1 / 60);

  const rows: ProfileRow[] = [];
  const original = game.qualityLevel;
  for (const level of QUALITY_LEVELS) {
    game.setQuality(level);
    // Let streaming settle for the new radii.
    for (let i = 0; i < 30; i++) g.renderFrame(1, 1 / 30, { steps: 2, alpha: 1, dropped: 0 });
    const sim: number[] = [];
    const frame: number[] = [];
    let calls = 0;
    let tris = 0;
    for (let f = 0; f < frames; f++) {
      g.input.state.press('KeyW');
      g.input.state.press('KeyE');
      game.fillEnergy();
      const t0 = performance.now();
      g.fixedUpdate(1 / 60);
      g.fixedUpdate(1 / 60);
      const t1 = performance.now();
      // Count every pass of the frame (bloom renders several), not just the last.
      renderer.info.autoReset = false;
      renderer.info.reset();
      g.renderFrame(1, 1 / 30, { steps: 2, alpha: 1, dropped: 0 });
      renderer.info.autoReset = true;
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t2 = performance.now();
      sim.push(t1 - t0);
      frame.push(t2 - t0);
      calls += renderer.info.render.calls;
      tris += renderer.info.render.triangles;
      // Yield occasionally so the page stays responsive.
      if (f % 15 === 14) await yieldToBrowser();
    }
    g.input.state.releaseAll();
    frame.sort((a, b) => a - b);
    rows.push({
      preset: level,
      simMs: round(avg(sim)),
      frameMs: round(avg(frame)),
      frameP95: round(frame[Math.floor(frame.length * 0.95)]!),
      drawCalls: Math.round(calls / frames),
      trisK: Math.round(tris / frames / 1000),
    });
  }
  game.setQuality(original);
  game.loop.paused = wasStopped.paused;
  game.loop.start();
  console.table(rows);
  return rows;
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const round = (v: number) => Math.round(v * 10) / 10;
