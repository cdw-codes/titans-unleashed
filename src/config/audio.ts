/** Mix and sound definitions. Files live in /public/audio; missing files are skipped silently. */
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
  /** One is picked at random per play (variation). Paths relative to /audio/. */
  readonly files: readonly string[];
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
  /** Distance model for spatial sounds (m). Kaiju scale: big reference distance. */
  readonly refDistance: number;
  readonly maxDistance: number;
  readonly rolloff: number;
  /** Seconds to crossfade between explore and combat music. */
  readonly musicFade: number;
  readonly sounds: Readonly<Record<SoundId, SoundDef>>;
}

const sfx = (files: string[], volume = 1, pitch: [number, number] = [0.9, 1.1], maxInstances = 4, spatial = true): SoundDef => ({
  files, bus: 'sfx', volume, pitchMin: pitch[0], pitchMax: pitch[1], maxInstances, spatial,
});

export const AUDIO: AudioConfig = {
  master: 0.8,
  buses: { sfx: 1, music: 0.45, ambience: 0.35 },
  maxVoices: 32,
  refDistance: 150,
  maxDistance: 3000,
  rolloff: 1.1,
  musicFade: 3,
  // File lists are filled in once the CC0 packs are downloaded (see CLAUDE.md / M7 notes).
  sounds: {
    footstep: sfx([], 0.9, [0.55, 0.7], 3, false),
    footstepSprint: sfx([], 1, [0.6, 0.75], 3, false),
    rivalFootstep: sfx([], 1, [0.5, 0.65], 3),
    collapseSmall: sfx([], 0.8, [0.8, 1.1], 5),
    collapseLarge: sfx([], 1, [0.6, 0.85], 4),
    crush: sfx([], 0.6, [0.8, 1.2], 6),
    impact: sfx([], 0.8, [0.7, 0.9], 4),
    explosion: sfx([], 0.8, [0.85, 1.15], 6),
    explosionBig: sfx([], 1, [0.7, 0.9], 3),
    claw: sfx([], 0.7, [0.7, 0.85], 2, false),
    tail: sfx([], 0.8, [0.6, 0.75], 2, false),
    stomp: sfx([], 1, [0.6, 0.7], 2, false),
    pulse: sfx([], 1, [0.8, 0.9], 1, false),
    beamCharge: sfx([], 0.8, [1, 1], 1, false),
    beamLoop: { ...sfx([], 0.8, [1, 1], 1, false), loop: true },
    beamStop: sfx([], 0.7, [0.9, 1], 1, false),
    roar: sfx([], 1, [0.75, 0.85], 1, false),
    rivalRoar: sfx([], 1, [0.6, 0.75], 1),
    playerHit: sfx([], 0.7, [0.8, 1], 3, false),
    knockdown: sfx([], 1, [0.6, 0.7], 1, false),
    tankFire: sfx([], 0.7, [0.9, 1.1], 6),
    rocketFire: sfx([], 0.6, [0.9, 1.1], 6),
    heliLoop: { ...sfx([], 0.5, [0.95, 1.05], 4), loop: true },
    warning: sfx([], 1, [0.6, 0.7], 1, false),
    victory: sfx([], 1, [1, 1], 1, false),
    defeat: sfx([], 1, [1, 1], 1, false),
    musicExplore: { files: [], bus: 'music', volume: 1, pitchMin: 1, pitchMax: 1, maxInstances: 1, spatial: false, loop: true },
    musicCombat: { files: [], bus: 'music', volume: 1, pitchMin: 1, pitchMax: 1, maxInstances: 1, spatial: false, loop: true },
    ambienceCity: { files: [], bus: 'ambience', volume: 1, pitchMin: 1, pitchMax: 1, maxInstances: 1, spatial: false, loop: true },
  },
};
