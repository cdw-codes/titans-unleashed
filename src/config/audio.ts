/** Mix and sound definitions. Placeholders are synthesized; listed files in /public/audio override them. */
import type { SynthId } from '../systems/audio/synth';
export type Bus = 'sfx' | 'music' | 'ambience';

export type SoundId =
  | 'footstep' | 'footstepSprint' | 'rivalFootstep'
  | 'collapseSmall' | 'collapseLarge' | 'crush' | 'impact'
  | 'explosion' | 'explosionBig'
  | 'claw' | 'tail' | 'stomp' | 'pulse'
  | 'beamCharge' | 'beamLoop' | 'beamStop'
  | 'roar' | 'rivalRoar' | 'playerHit' | 'knockdown'
  | 'tankFire' | 'rocketFire' | 'heliLoop'
  | 'warning' | 'victory' | 'defeat'
  | 'musicExplore' | 'musicCombat' | 'ambienceCity';

export interface SoundDef {
  /** One is picked at random per play (variation). Paths relative to /audio/. Empty = use `synth`. */
  readonly files: readonly string[];
  /** Code-generated placeholder used when no file is listed or loads. */
  readonly synth: SynthId;
  readonly bus: Bus;
  readonly volume: number;
  /** Random playback-rate range: lower = bigger and heavier. */
  readonly pitchMin: number;
  readonly pitchMax: number;
  /** Max simultaneous instances of this sound (oldest is cut). */
  readonly maxInstances: number;
  /** 3D positioned (distance attenuation + panning). */
  readonly spatial: boolean;
  readonly loop?: boolean;
}

export interface AudioConfig {
  readonly master: number;
  readonly buses: Readonly<Record<Bus, number>>;
  /** Hard cap on simultaneous voices across all sounds. */
  readonly maxVoices: number;
  /** Distance model for spatial sounds (m). Titan scale: big reference distance. */
  readonly refDistance: number;
  readonly maxDistance: number;
  readonly rolloff: number;
  /** Seconds to crossfade between explore and combat music. */
  readonly musicFade: number;
  readonly sounds: Readonly<Record<SoundId, SoundDef>>;
}

const sfx = (synth: SynthId, volume = 1, pitch: [number, number] = [0.9, 1.1], maxInstances = 4, spatial = true): SoundDef => ({
  files: [], synth, bus: 'sfx', volume, pitchMin: pitch[0], pitchMax: pitch[1], maxInstances, spatial,
});
const track = (synth: SynthId, bus: Bus): SoundDef => ({
  files: [], synth, bus, volume: 1, pitchMin: 1, pitchMax: 1, maxInstances: 1, spatial: false, loop: true,
});

export const AUDIO: AudioConfig = {
  master: 0.8,
  buses: { sfx: 1, music: 0.45, ambience: 0.35 },
  maxVoices: 32,
  refDistance: 150,
  maxDistance: 3000,
  rolloff: 1.1,
  musicFade: 3,
  // Every sound is a code-generated placeholder (systems/audio/synth.ts). To use real
  // recordings, drop files in public/audio and list them in `files`.
  sounds: {
    footstep: sfx('thud', 0.9, [0.8, 0.95], 3, false),
    footstepSprint: sfx('thud', 1, [0.85, 1], 3, false),
    rivalFootstep: sfx('thud', 1, [0.7, 0.8], 3),
    collapseSmall: sfx('crunch', 0.8, [0.8, 1.1], 5),
    collapseLarge: sfx('rumble', 1, [0.8, 1], 4),
    crush: sfx('crunch', 0.6, [1, 1.3], 6),
    impact: sfx('thud', 0.8, [1, 1.2], 4),
    explosion: sfx('boom', 0.8, [0.9, 1.2], 6),
    explosionBig: sfx('boom', 1, [0.65, 0.8], 3),
    claw: sfx('whoosh', 0.7, [0.9, 1.1], 2, false),
    tail: sfx('whoosh', 0.8, [0.6, 0.75], 2, false),
    stomp: sfx('boom', 1, [0.55, 0.65], 2, false),
    pulse: sfx('pulse', 1, [0.9, 1], 1, false),
    beamCharge: sfx('charge', 0.8, [1, 1], 1, false),
    beamLoop: { ...sfx('hum', 0.8, [1, 1], 1, false), loop: true },
    beamStop: sfx('zapDown', 0.7, [0.9, 1], 1, false),
    roar: sfx('roar', 1, [0.9, 1], 1, false),
    rivalRoar: sfx('roar', 1, [0.7, 0.8], 1),
    playerHit: sfx('growl', 0.7, [0.8, 1], 3, false),
    knockdown: sfx('boom', 1, [0.5, 0.6], 1, false),
    tankFire: sfx('cannon', 0.7, [0.9, 1.1], 6),
    rocketFire: sfx('rocket', 0.6, [0.9, 1.1], 6),
    heliLoop: { ...sfx('rotor', 0.5, [0.95, 1.05], 4), loop: true },
    warning: sfx('rumble', 1, [0.6, 0.7], 1, false),
    victory: sfx('fanfare', 0.8, [1, 1], 1, false),
    defeat: sfx('lament', 0.8, [1, 1], 1, false),
    musicExplore: track('padMusic', 'music'),
    musicCombat: track('drumMusic', 'music'),
    ambienceCity: track('wind', 'ambience'),
  },
};
