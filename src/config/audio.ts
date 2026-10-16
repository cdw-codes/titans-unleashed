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
  // Files are produced by `npm run assets` from assets-src/ (see docs/ASSETS.md).
  sounds: {
    footstep: sfx(['step0.ogg', 'step1.ogg', 'step2.ogg', 'step3.ogg', 'step4.ogg'], 0.9, [0.55, 0.7], 3, false),
    footstepSprint: sfx(['stepsprint0.ogg', 'stepsprint1.ogg', 'stepsprint2.ogg', 'stepsprint3.ogg', 'stepsprint4.ogg'], 1, [0.6, 0.75], 3, false),
    rivalFootstep: sfx(['step0.ogg', 'step1.ogg', 'step2.ogg', 'step3.ogg', 'step4.ogg'], 1, [0.5, 0.65], 3),
    collapseSmall: sfx(['crunch0.ogg', 'crunch1.ogg', 'crunch2.ogg', 'crunch3.ogg', 'crunch4.ogg'], 0.8, [0.8, 1.1], 5),
    collapseLarge: sfx(['rumble.wav', 'lowboom0.ogg', 'lowboom1.ogg'], 1, [0.6, 0.85], 4),
    crush: sfx(['crush0.ogg', 'crush1.ogg', 'crush2.ogg', 'crush3.ogg', 'crush4.ogg'], 0.6, [0.8, 1.2], 6),
    impact: sfx(['hit0.ogg', 'hit1.ogg', 'hit2.ogg', 'hit3.ogg', 'hit4.ogg'], 0.8, [0.7, 0.9], 4),
    explosion: sfx(['bang1.ogg', 'bang2.ogg', 'bang3.ogg', 'bang4.ogg', 'bang5.ogg', 'bang6.ogg', 'bang7.ogg', 'bang8.ogg', 'bang9.ogg', 'bang10.ogg'], 0.8, [0.85, 1.15], 6),
    explosionBig: sfx(['lowboom0.ogg', 'lowboom1.ogg'], 1, [0.7, 0.9], 3),
    claw: sfx(['hit0.ogg', 'hit1.ogg', 'hit2.ogg', 'hit3.ogg', 'hit4.ogg'], 0.7, [0.7, 0.85], 2, false),
    tail: sfx(['stepsprint0.ogg', 'stepsprint1.ogg', 'stepsprint2.ogg', 'stepsprint3.ogg', 'stepsprint4.ogg'], 0.8, [0.6, 0.75], 2, false),
    stomp: sfx(['stomp.ogg', 'lowboom0.ogg'], 1, [0.6, 0.7], 2, false),
    pulse: sfx(['forcefield0.ogg', 'forcefield1.ogg', 'forcefield2.ogg', 'forcefield3.ogg', 'forcefield4.ogg'], 1, [0.8, 0.9], 1, false),
    beamCharge: sfx(['powerup1.mp3', 'powerup3.mp3'], 0.8, [1, 1], 1, false),
    beamLoop: { ...sfx(['beam.wav'], 0.8, [1, 1], 1, false), loop: true },
    beamStop: sfx(['phaserdown1.mp3', 'phaserdown2.mp3', 'phaserdown3.mp3'], 0.7, [0.9, 1], 1, false),
    roar: sfx(['roar.wav'], 1, [0.75, 0.85], 1, false),
    rivalRoar: sfx(['rivalroar1.ogg', 'rivalroar2.ogg', 'rivalroar3.ogg', 'rivalroar4.ogg', 'rivalroar5.ogg', 'rivalroar6.ogg', 'howl.ogg'], 1, [0.6, 0.75], 1),
    playerHit: sfx(['hurt1.ogg', 'hurt2.ogg', 'hurt3.ogg', 'hurt4.ogg', 'hurt5.ogg'], 0.7, [0.8, 1], 3, false),
    knockdown: sfx(['lowboom0.ogg', 'lowboom1.ogg'], 1, [0.6, 0.7], 1, false),
    tankFire: sfx(['cannon1.ogg', 'cannon2.ogg', 'cannon3.ogg', 'cannon4.ogg', 'cannon5.ogg'], 0.7, [0.9, 1.1], 6),
    rocketFire: sfx(['rocket0.ogg', 'rocket1.ogg', 'rocket2.ogg', 'rocket3.ogg', 'rocket4.ogg'], 0.6, [0.9, 1.1], 6),
    heliLoop: { ...sfx(['helicopter.mp3'], 0.5, [0.95, 1.05], 4), loop: true },
    warning: sfx(['rumble.wav'], 1, [0.6, 0.7], 1, false),
    victory: sfx(['victory.mp3'], 1, [1, 1], 1, false),
    defeat: sfx(['defeat.mp3'], 1, [1, 1], 1, false),
    musicExplore: { files: ['music-explore.wav'], bus: 'music', volume: 1, pitchMin: 1, pitchMax: 1, maxInstances: 1, spatial: false, loop: true },
    musicCombat: { files: ['music-combat.mp3'], bus: 'music', volume: 1, pitchMin: 1, pitchMax: 1, maxInstances: 1, spatial: false, loop: true },
    ambienceCity: { files: ['ambience-city.ogg'], bus: 'ambience', volume: 1, pitchMin: 1, pitchMax: 1, maxInstances: 1, spatial: false, loop: true },
  },
};
