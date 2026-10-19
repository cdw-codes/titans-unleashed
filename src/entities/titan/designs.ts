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
  // ---- Body plan (all default 1 / 0): proportions and carriage, not just decoration.
  /** Leg length multiplier: long-legged striders vs. squat tanks. */
  legLength?: number;
  /** Torso length multiplier (pelvis → chest → shoulders). */
  torsoLength?: number;
  /** Head size multiplier. */
  headScale?: number;
  /** Shoulder width multiplier (where the arms hang from). */
  shoulderWidth?: number;
  /** Tail carriage (rad): + lifts the tail toward horizontal (counterbalancing a forward body). */
  tailLift?: number;
  /** Resting arm carriage (rad): + raises the upper arms forward and folds the forearms up. */
  armRaise?: number;
  /** Great folded membrane wings on the back. */
  wings?: boolean;
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

/** Titanus Ignicorn, the Horned Brawler: knuckle-walking, short-legged, horned brawler with oversized arms and ember-lit spikes. */
export const THORNMAW_DESIGN: TitanDesign = {
  palette: { skin: 0x6b3a2c, skinDark: 0x47261c, belly: 0x9c7a5a, plate: 0x2d221d, claw: 0xe8d9b8, eye: 0xffd27a },
  glowColor: 0xff6a1a,
  back: 'spikes',
  armScale: 1.7,
  clawLength: 1.8,
  bulk: 1.3,
  hunch: 0.55,
  neckScale: 0.55,
  tailScale: 0.55,
  horns: true,
  tusks: true,
  crest: false,
  shoulderOrbs: false,
  legLength: 0.8,
  torsoLength: 0.95,
  shoulderWidth: 1.3,
  headScale: 0.85,
  armRaise: 0.15,
  legScale: 1.15,
};

/** Titanus Vesperion, the Crested Siege-Beast: tall, long-legged, winged, ranged attacker with a fan crest and plasma orbs on its shoulders. */
export const VESPERION_DESIGN: TitanDesign = {
  palette: { skin: 0x3e3a55, skinDark: 0x2a2740, belly: 0x8a86a6, plate: 0xc9b8ff, claw: 0xd8d2f0, eye: 0xf2a6ff },
  glowColor: 0xb05cff,
  back: 'crest',
  armScale: 0.85,
  clawLength: 1,
  bulk: 0.75,
  hunch: -0.05,
  neckScale: 1.6,
  tailScale: 1.4,
  horns: false,
  tusks: false,
  crest: true,
  shoulderOrbs: true,
  legLength: 1.3,
  torsoLength: 1.15,
  shoulderWidth: 0.85,
  headScale: 0.9,
  wings: true,
  legScale: 0.85,
};

/** Titanus Velacor, the Sail Stalker: horizontal river predator (body level, tail as counterweight) with a towering spined sail, croc snout and bladed tail. */
export const VELACOR_DESIGN: TitanDesign = {
  palette: { skin: 0x5a5a3e, skinDark: 0x3f3f2a, belly: 0xa59a74, plate: 0xb4573a, claw: 0xe6dcc0, eye: 0xffe08a },
  glowColor: 0xffa23a,
  back: 'sail',
  head: 'croc',
  tailTip: 'blade',
  armScale: 0.75,
  clawLength: 1.6,
  bulk: 0.9,
  hunch: 1.0,
  neckScale: 1.3,
  tailScale: 1.6,
  legScale: 0.95,
  horns: false,
  tusks: false,
  crest: false,
  shoulderOrbs: false,
  tailLift: 0.55,
  legLength: 1.2,
  headScale: 1.15,
  torsoLength: 1.25,
};

/** Titanus Testudrax, the Living Bastion: squat, wide, low-slung shell-backed juggernaut with a blunt skull and a club tail. */
export const TESTUDRAX_DESIGN: TitanDesign = {
  palette: { skin: 0x56604f, skinDark: 0x3c4437, belly: 0x9d9478, plate: 0x6f5a42, claw: 0xd8ceb4, eye: 0xb6ff7a },
  glowColor: 0x8dff5c,
  back: 'shell',
  head: 'blunt',
  tailTip: 'club',
  armScale: 1.2,
  clawLength: 0.8,
  bulk: 1.55,
  hunch: 0.35,
  neckScale: 0.5,
  tailScale: 0.8,
  legScale: 1.5,
  horns: false,
  tusks: true,
  crest: false,
  shoulderOrbs: false,
  legLength: 0.7,
  torsoLength: 0.8,
  shoulderWidth: 1.35,
  headScale: 1.1,
};

/** Titanus Fulgurax, the Storm Herald: mantis-built striker, wasp waist, raised blade-arms, crystal quills and collar. */
export const FULGURAX_DESIGN: TitanDesign = {
  palette: { skin: 0x2f3a4a, skinDark: 0x202834, belly: 0x6f7f93, plate: 0xbfe6ff, claw: 0xdde8f2, eye: 0xe8f8ff },
  glowColor: 0x6fd0ff,
  back: 'quills',
  frill: true,
  armBlades: true,
  armScale: 1.55,
  clawLength: 1.3,
  bulk: 0.7,
  hunch: 0.3,
  neckScale: 1.1,
  tailScale: 1.35,
  legScale: 0.85,
  horns: false,
  tusks: false,
  crest: false,
  shoulderOrbs: false,
  legLength: 1.25,
  shoulderWidth: 1.35,
  armRaise: 0.8,
  headScale: 0.8,
};
