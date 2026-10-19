/** Look of a titan built by TitanModel: palette, proportions and silhouette features. Art, not tuning. */
export interface TitanDesign {
  palette: { skin: number; skinDark: number; belly: number; plate: number; claw: number; eye: number };
  glowColor: number;
  /** Back silhouette, the quickest way to tell titans apart at a distance. */
  back: 'plates' | 'spikes' | 'crest' | 'sail' | 'shell' | 'quills';
  /** Head shape (default lizard). Croc = long flat snout, blunt = short heavy skull. */
  head?: 'lizard' | 'croc' | 'blunt';
  /** Tail end (default plain): a bony club or a glowing blade. */
  tailTip?: 'none' | 'club' | 'blade';
  /** Fan of spines flaring from the back of the skull. */
  frill?: boolean;
  /** Bony blades along the forearms. */
  armBlades?: boolean;
  /** Leg thickness multiplier (default 1). */
  legScale?: number;
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

/** Titanus Aegirax, the Tidecaller: atomic sea lizard with glowing dorsal plates. */
export const PLAYER_DESIGN: TitanDesign = {
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

/** Titanus Ignicorn, the Horned Brawler: hunched, horned brawler with oversized arms and ember-lit spikes. */
export const THORNMAW_DESIGN: TitanDesign = {
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

/** Titanus Vesperion, the Crested Siege-Beast: tall, long-necked ranged attacker with a fan crest and plasma orbs on its shoulders. */
export const VESPERION_DESIGN: TitanDesign = {
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

/** Titanus Velacor, the Sail Stalker: lean river hunter with a towering spined sail, croc snout and bladed tail. */
export const VELACOR_DESIGN: TitanDesign = {
  palette: { skin: 0x5a5a3e, skinDark: 0x3f3f2a, belly: 0xa59a74, plate: 0xb4573a, claw: 0xe6dcc0, eye: 0xffe08a },
  glowColor: 0xffa23a,
  back: 'sail',
  head: 'croc',
  tailTip: 'blade',
  armScale: 1.15,
  clawLength: 1.6,
  bulk: 0.9,
  hunch: 0.18,
  neckScale: 1.15,
  tailScale: 1.4,
  legScale: 0.95,
  horns: false,
  tusks: false,
  crest: false,
  shoulderOrbs: false,
};

/** Titanus Testudrax, the Living Bastion: shell-backed juggernaut with a blunt skull and a club tail. */
export const TESTUDRAX_DESIGN: TitanDesign = {
  palette: { skin: 0x56604f, skinDark: 0x3c4437, belly: 0x9d9478, plate: 0x6f5a42, claw: 0xd8ceb4, eye: 0xb6ff7a },
  glowColor: 0x8dff5c,
  back: 'shell',
  head: 'blunt',
  tailTip: 'club',
  armScale: 1.2,
  clawLength: 0.8,
  bulk: 1.35,
  hunch: 0.12,
  neckScale: 0.6,
  tailScale: 0.85,
  legScale: 1.35,
  horns: false,
  tusks: true,
  crest: false,
  shoulderOrbs: false,
};

/** Titanus Fulgurax, the Storm Herald: crystal-quilled, frilled striker with forearm blades. */
export const FULGURAX_DESIGN: TitanDesign = {
  palette: { skin: 0x2f3a4a, skinDark: 0x202834, belly: 0x6f7f93, plate: 0xbfe6ff, claw: 0xdde8f2, eye: 0xe8f8ff },
  glowColor: 0x6fd0ff,
  back: 'quills',
  frill: true,
  armBlades: true,
  armScale: 1.05,
  clawLength: 1.3,
  bulk: 0.95,
  hunch: 0.05,
  neckScale: 1.1,
  tailScale: 1.1,
  legScale: 0.95,
  horns: false,
  tusks: false,
  crest: false,
  shoulderOrbs: false,
};
