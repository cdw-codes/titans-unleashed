import { TITAN_BODY, TITAN_CONTROLLER, TITAN_FEEDBACK, TITAN_GAIT, TITAN_MOVEMENT } from '../config/titan';
import { CAMERA, SHAKE } from '../config/camera';
import { MOUSE } from '../config/input';
import { BEAM_VISUAL, DUST, FIRE, SHOCKWAVE, SMOKE } from '../config/effects';
import { COMBAT } from '../config/combat';
import { POSTFX } from '../config/postfx';
import { RIVALS } from '../config/rivals';
import { ENCOUNTERS } from '../config/encounters';
import { MILITARY } from '../config/military';
import { UPGRADES } from '../config/upgrades';
import { DESTRUCTION } from '../config/destruction';
import { CITY } from '../config/city';
import { TERRAIN } from '../config/terrain';
import { ENVIRONMENT } from '../config/environment';
import { SIM } from '../config/sim';

export type Range = [min: number, max: number, step?: number];

/** A config object exposed in the dev tuning panel and writable back to its source file. */
export interface Tunable {
  folder: string;
  /** File in src/config. */
  file: string;
  exportName: string;
  obj: object;
  /** Read only at startup: changes apply after Save (which reloads the page). */
  reloadOnly?: boolean;
  /** Keys (dot paths) to leave out. */
  exclude?: string[];
  /** Slider ranges for keys where the auto range would be wrong. */
  ranges?: Record<string, Range>;
}

const fraction: Range = [0, 1, 0.01];

export const TUNABLES: Tunable[] = [
  {
    folder: 'Titan movement', file: 'titan.ts', exportName: 'TITAN_MOVEMENT', obj: TITAN_MOVEMENT,
    ranges: { turnSlowdown: fraction, walkSpeed: [1, 40, 0.5], sprintSpeed: [1, 60, 0.5] },
  },
  { folder: 'Titan gait', file: 'titan.ts', exportName: 'TITAN_GAIT', obj: TITAN_GAIT },
  { folder: 'Footstep feedback', file: 'titan.ts', exportName: 'TITAN_FEEDBACK', obj: TITAN_FEEDBACK, ranges: { walkStepTrauma: fraction, sprintStepTrauma: fraction } },
  { folder: 'Titan body', file: 'titan.ts', exportName: 'TITAN_BODY', obj: TITAN_BODY, reloadOnly: true },
  { folder: 'Titan controller', file: 'titan.ts', exportName: 'TITAN_CONTROLLER', obj: TITAN_CONTROLLER, reloadOnly: true },
  {
    folder: 'Camera', file: 'camera.ts', exportName: 'CAMERA', obj: CAMERA,
    ranges: { minPitch: [-1.5, 0.5, 0.01], maxPitch: [0, 1.5, 0.01], initialPitch: [-0.5, 1.2, 0.01], shoulderOffset: [-80, 80, 1] },
  },
  { folder: 'Camera shake', file: 'camera.ts', exportName: 'SHAKE', obj: SHAKE },
  { folder: 'Mouse', file: 'input.ts', exportName: 'MOUSE', obj: MOUSE, ranges: { sensitivity: [0.0002, 0.01, 0.0001] } },
  { folder: 'Combat', file: 'combat.ts', exportName: 'COMBAT', obj: COMBAT },
  { folder: 'Beam visual', file: 'effects.ts', exportName: 'BEAM_VISUAL', obj: BEAM_VISUAL },
  { folder: 'Beam fire', file: 'effects.ts', exportName: 'FIRE', obj: FIRE, exclude: ['capacity', 'brightness'] },
  { folder: 'Shockwaves', file: 'effects.ts', exportName: 'SHOCKWAVE', obj: SHOCKWAVE },
  { folder: 'Bloom', file: 'postfx.ts', exportName: 'POSTFX', obj: POSTFX, reloadOnly: true, ranges: { bloomThreshold: [0, 3, 0.05] } },
  { folder: 'Rivals', file: 'rivals.ts', exportName: 'RIVALS', obj: RIVALS, exclude: ['thornmaw.combat.beam'] },
  { folder: 'Encounters', file: 'encounters.ts', exportName: 'ENCOUNTERS', obj: ENCOUNTERS },
  { folder: 'Military', file: 'military.ts', exportName: 'MILITARY', obj: MILITARY },
  { folder: 'Upgrades', file: 'upgrades.ts', exportName: 'UPGRADES', obj: UPGRADES },
  { folder: 'Destruction', file: 'destruction.ts', exportName: 'DESTRUCTION', obj: DESTRUCTION },
  { folder: 'Dust', file: 'effects.ts', exportName: 'DUST', obj: DUST, exclude: ['capacity'] },
  { folder: 'Smoke', file: 'effects.ts', exportName: 'SMOKE', obj: SMOKE, exclude: ['capacity'] },
  { folder: 'Environment', file: 'environment.ts', exportName: 'ENVIRONMENT', obj: ENVIRONMENT, reloadOnly: true, ranges: { sunElevation: [5, 85, 1], sunAzimuth: [0, 360, 1] } },
  { folder: 'City generation', file: 'city.ts', exportName: 'CITY', obj: CITY, reloadOnly: true, exclude: ['seed'] },
  { folder: 'Terrain', file: 'terrain.ts', exportName: 'TERRAIN', obj: TERRAIN, reloadOnly: true, exclude: ['seed'] },
  { folder: 'Frame rate', file: 'sim.ts', exportName: 'SIM', obj: SIM, reloadOnly: true, exclude: ['tickRate', 'maxStepsPerFrame', 'maxFrameDelta'], ranges: { renderFpsCap: [0, 144, 1] } },
];

/** Auto slider range: 0..3x the value (symmetric for negatives), ~300 steps. */
export function autoRange(v: number): Range {
  const a = Math.abs(v);
  if (a === 0) return [0, 1, 0.01];
  const max = a * 3;
  const step = Number((max / 300).toPrecision(1));
  return [v < 0 ? -max : 0, max, step];
}

/** Numeric leaves of a config object as dot paths (colors and excluded keys removed). */
export function numericPaths(obj: object, exclude: string[] = [], prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (exclude.includes(path) || /color/i.test(k)) continue;
    if (typeof v === 'number') out.push(path);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...numericPaths(v, exclude, path));
  }
  return out;
}

export function getPath(obj: object, path: string): number {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as number;
}

export function setPath(obj: object, path: string, value: number): void {
  const keys = path.split('.');
  const parent = keys.slice(0, -1).reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, obj as Record<string, unknown>);
  parent[keys[keys.length - 1]!] = value;
}
