/** Look of a kaiju built by KaijuModel: palette, proportions and silhouette features. Art, not tuning. */
export interface KaijuDesign {
  palette: { skin: number; skinDark: number; belly: number; plate: number; claw: number; eye: number };
  glowColor: number;
  back: 'plates' | 'spikes' | 'crest';
  /** Arm length/thickness multiplier. */
  armScale: number;
  clawLength: number;
  /** Torso width multiplier. */
  bulk: number;
  /** Extra forward lean of the spine (rad). */
  hunch: number;
  neckScale: number;
  tailScale: number;
  horns: boolean;
  tusks: boolean;
  crest: boolean;
  shoulderOrbs: boolean;
}

/** The player: atomic lizard with glowing dorsal plates. */
export const PLAYER_DESIGN: KaijuDesign = {
  palette: { skin: 0x4a5e4f, skinDark: 0x37463b, belly: 0x7d7660, plate: 0xa8bcc4, claw: 0xd9d2bd, eye: 0xffffff },
  glowColor: 0x58d8ff,
  back: 'plates',
  armScale: 1,
  clawLength: 1,
  bulk: 1,
  hunch: 0,
  neckScale: 1,
  tailScale: 1,
  horns: false,
  tusks: false,
  crest: false,
  shoulderOrbs: false,
};

/** Thornmaw: hunched, horned brawler with oversized arms and ember-lit spikes. */
export const THORNMAW_DESIGN: KaijuDesign = {
  palette: { skin: 0x6b3a2c, skinDark: 0x47261c, belly: 0x9c7a5a, plate: 0x2d221d, claw: 0xe8d9b8, eye: 0xffd27a },
  glowColor: 0xff6a1a,
  back: 'spikes',
  armScale: 1.45,
  clawLength: 1.8,
  bulk: 1.2,
  hunch: 0.32,
  neckScale: 0.7,
  tailScale: 0.75,
  horns: true,
  tusks: true,
  crest: false,
  shoulderOrbs: false,
};

/** Vesperion: tall, long-necked ranged attacker with a fan crest and plasma orbs on its shoulders. */
export const VESPERION_DESIGN: KaijuDesign = {
  palette: { skin: 0x3e3a55, skinDark: 0x2a2740, belly: 0x8a86a6, plate: 0xc9b8ff, claw: 0xd8d2f0, eye: 0xf2a6ff },
  glowColor: 0xb05cff,
  back: 'crest',
  armScale: 0.85,
  clawLength: 1,
  bulk: 0.85,
  hunch: -0.05,
  neckScale: 1.45,
  tailScale: 1.3,
  horns: false,
  tusks: false,
  crest: true,
  shoulderOrbs: true,
};
