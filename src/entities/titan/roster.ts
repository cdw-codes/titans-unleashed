import type { RivalId } from '../../config/rivals';
import { COMBAT } from '../../config/combat';
import { TITAN_BODY, TITAN_GAIT, TITAN_MOVEMENT } from '../../config/titan';
import { bodyFor, combatFor, gaitFor, movementFor, type TitanProfile } from './profiles';
import type { TitanSpec } from './TitanSpec';
import { FULGURAX_DESIGN, PLAYER_DESIGN, TESTUDRAX_DESIGN, THORNMAW_DESIGN, VELACOR_DESIGN, VESPERION_DESIGN, type TitanDesign } from './designs';

/** Stable ids (URLs, multiplayer); the display name is the Titanus designation. */
export type TitanId = 'tidecaller' | 'thornmaw' | 'vesperion' | 'velacor' | 'testudrax' | 'fulgurax';

export interface TitanColorway {
  readonly name: string;
  readonly palette: TitanDesign['palette'];
  readonly glow: number;
  /** Beam core / glow (the beam takes the titan's glow). */
  readonly beam: { core: number; glow: number };
}

export interface RosterTitan {
  readonly id: TitanId;
  /** Designation in the field taxonomy: "Titanus <Name>" (original names only). */
  readonly name: string;
  /** Common name, "the ...". */
  readonly epithet: string;
  readonly blurb: string;
  readonly design: TitanDesign;
  /** Size, weight, dossier and play ratings. */
  readonly profile: TitanProfile;
  /** The rival that shares this look (kept out of the rival rotation when picked). */
  readonly rival?: RivalId;
  readonly colors: readonly TitanColorway[];
}

const way = (name: string, skin: number, skinDark: number, belly: number, plate: number, glow: number, core: number, claw = 0xd9d2bd, eye = 0xffffff): TitanColorway => ({
  name,
  palette: { skin, skinDark, belly, plate, claw, eye },
  glow,
  beam: { core, glow },
});

/**
 * Playable titans (title screen). The look changes, the moves stay the same, so
 * the choice is about character, not balance. Colorways recolor body and glow.
 */
export const ROSTER: readonly RosterTitan[] = [
  {
    id: 'tidecaller',
    name: 'Titanus Aegirax',
    epithet: 'The Tidecaller',
    blurb: 'Atomic lizard risen from the deep: glowing dorsal plates and a charged breath beam.',
    design: PLAYER_DESIGN,
    profile: {
      height: 108, length: 230, weight: 92000,
      classification: 'Apex amphibious saurian',
      origin: 'Hadal trench vents, western Pacific',
      abilities: ['Atomic breath beam', 'Balanced in every discipline', 'Thrives in deep water'],
      ratings: { power: 3, armor: 3, speed: 3, agility: 3, beam: 3 },
    },
    colors: [
      way('Abyss', 0x4a5e4f, 0x37463b, 0x7d7660, 0xa8bcc4, 0x58d8ff, 0xd8fbff),
      way('Obsidian', 0x2f3236, 0x1f2124, 0x5a5650, 0x9aa3ad, 0x7dffb0, 0xe2ffef),
      way('Coral', 0x8a5a4a, 0x5e3c31, 0xc8a78a, 0xf0d2c0, 0xff8a5c, 0xffe4d6),
      way('Glacier', 0x8fa3b0, 0x657783, 0xd8dde0, 0xe9f6ff, 0x9fd8ff, 0xf2fbff),
      way('Moss', 0x5b6b2f, 0x404b20, 0xa59a62, 0xd8e08a, 0xd6ff5c, 0xf6ffd8),
      way('Crimson Tide', 0x3a2a30, 0x271c21, 0x7a5a5e, 0xd88a96, 0xff4a6a, 0xffd6de),
    ],
  },
  {
    id: 'thornmaw',
    name: 'Titanus Ignicorn',
    epithet: 'The Horned Brawler',
    blurb: 'Hunched, horned brawler with huge arms and ember-lit spikes.',
    design: THORNMAW_DESIGN,
    profile: {
      height: 92, length: 150, weight: 118000,
      classification: 'Armored horned brawler',
      origin: 'Volcanic caldera, Kamchatka arc',
      abilities: ['Crushing melee strength', 'Thick hide, hard to stagger', 'Slow to turn and run'],
      ratings: { power: 5, armor: 4, speed: 2, agility: 2, beam: 2 },
    },
    rival: 'thornmaw',
    colors: [
      way('Ember', 0x6b3a2c, 0x47261c, 0x9c7a5a, 0x2d221d, 0xff6a1a, 0xffe2c4, 0xe8d9b8, 0xffd27a),
      way('Basalt', 0x3b3a39, 0x262524, 0x77706a, 0x161514, 0xff3b2f, 0xffd6cc, 0xe8d9b8, 0xffb37a),
      way('Sandstorm', 0x9a7b4f, 0x6e5636, 0xd2b98a, 0x4a3a26, 0xffc23a, 0xfff0c4, 0xf2e6c8, 0xffe7a0),
      way('Toxic', 0x4d5a2b, 0x323c1b, 0x8c8a52, 0x1e2412, 0xb6ff3a, 0xf0ffd0, 0xe8e2b8, 0xe6ff7a),
      way('Bloodmoon', 0x5a1f22, 0x3c1416, 0x8a5a54, 0x1c0e0e, 0xff2a4a, 0xffd0d8, 0xe8d0c8, 0xff9aa8),
      way('Cinderfrost', 0x4a5560, 0x323a42, 0x8e9aa4, 0x1a2026, 0x5ad2ff, 0xd6f6ff, 0xe2e8ee, 0xa6e8ff),
    ],
  },
  {
    id: 'vesperion',
    name: 'Titanus Vesperion',
    epithet: 'The Crested Siege-Beast',
    blurb: 'Tall, long-necked titan with a fan crest and plasma orbs on its shoulders.',
    design: VESPERION_DESIGN,
    profile: {
      height: 128, length: 260, weight: 64000,
      classification: 'Winged siege titan',
      origin: 'Storm-cell roosts above the Andes',
      abilities: ['Long-reach plasma beam', 'Light on its feet', 'Fragile under close assault'],
      ratings: { power: 2, armor: 2, speed: 3, agility: 4, beam: 4 },
    },
    rival: 'vesperion',
    colors: [
      way('Dusk', 0x3e3a55, 0x2a2740, 0x8a86a6, 0xc9b8ff, 0xb05cff, 0xf3dcff, 0xd8d2f0, 0xf2a6ff),
      way('Aurora', 0x2e4a52, 0x1f3238, 0x7fa6a8, 0xb8fff0, 0x3dffd0, 0xd8fff6, 0xd2f0ec, 0xa6fff0),
      way('Pearl', 0x8c8794, 0x625e6a, 0xd6d2dc, 0xffffff, 0xffb8ec, 0xfff0fa, 0xf0ecf6, 0xffd6f4),
      way('Nightglass', 0x1d1f2e, 0x12131d, 0x4a4c66, 0x8890ff, 0x5c6cff, 0xdce0ff, 0xc8ccf0, 0xa6b0ff),
      way('Solar', 0x6a4a1e, 0x4a3214, 0xb08a52, 0xffe08a, 0xffb02a, 0xfff2cc, 0xf6e6c0, 0xffe2a0),
      way('Verdigris', 0x3a5a4e, 0x284036, 0x8ab0a0, 0xd8b06a, 0x5affb0, 0xe0fff0, 0xe0ecd8, 0x9affd0),
    ],
  },
  {
    id: 'velacor',
    name: 'Titanus Velacor',
    epithet: 'The Sail Stalker',
    blurb: 'Lean river hunter: a towering spined sail, a crocodile snout and a tail that ends in a blade.',
    design: VELACOR_DESIGN,
    profile: {
      height: 96, length: 240, weight: 70000,
      classification: 'Riverine ambush predator',
      origin: 'Flooded river deltas, Bay of Bengal',
      abilities: ['Fastest titan in a sprint', 'Low, level stance', 'Thin armor'],
      ratings: { power: 3, armor: 2, speed: 5, agility: 3, beam: 2 },
    },
    colors: [
      way('Riverbed', 0x5a5a3e, 0x3f3f2a, 0xa59a74, 0xb4573a, 0xffa23a, 0xfff0d0, 0xe6dcc0, 0xffe08a),
      way('Mangrove', 0x34483a, 0x233228, 0x7f9478, 0x3f7a6a, 0x4affc2, 0xdcfff2, 0xd8e6cc, 0xb4ffe0),
      way('Delta Mud', 0x6e5a44, 0x4e3f2f, 0xb8a080, 0x8a3a2a, 0xff5a2a, 0xffe0d0, 0xeadcc4, 0xffb08a),
      way('Monsoon', 0x40485a, 0x2c3240, 0x8890a6, 0x5a78b4, 0x6ab0ff, 0xe0eeff, 0xdde2ee, 0xb0d4ff),
      way('Saffron', 0x7a6a3a, 0x564a28, 0xc8b482, 0xe0a030, 0xffd23a, 0xfff6d0, 0xf2e6c4, 0xfff0a0),
      way('Nightwater', 0x22262a, 0x16191c, 0x4e555c, 0x6a2a5a, 0xff4ad2, 0xffd8f6, 0xd6d2dc, 0xff9ae8),
    ],
  },
  {
    id: 'testudrax',
    name: 'Titanus Testudrax',
    epithet: 'The Living Bastion',
    blurb: 'Shell-backed juggernaut with tree-trunk legs, a blunt armored skull and a club tail.',
    design: TESTUDRAX_DESIGN,
    profile: {
      height: 74, length: 150, weight: 165000,
      classification: 'Fortress-shell juggernaut',
      origin: 'Deep continental crust, Siberian craton',
      abilities: ['Near-impenetrable carapace', 'Heaviest footfalls of all', 'Barely outruns a glacier'],
      ratings: { power: 4, armor: 5, speed: 1, agility: 2, beam: 3 },
    },
    colors: [
      way('Old Growth', 0x56604f, 0x3c4437, 0x9d9478, 0x6f5a42, 0x8dff5c, 0xeaffd8, 0xd8ceb4, 0xb6ff7a),
      way('Granite', 0x5e5e60, 0x424244, 0xa09e98, 0x7a7670, 0xffb43a, 0xfff0d0, 0xe0dcd0, 0xffd48a),
      way('Magma Shell', 0x3e3432, 0x2a2322, 0x7a6660, 0x2a1a16, 0xff5a1a, 0xffdcc8, 0xe0d0c4, 0xffa070),
      way('Reef', 0x4a6670, 0x33484f, 0x9ab4b4, 0xd88a6a, 0x5ae6ff, 0xdcfaff, 0xe4ecea, 0xa6f2ff),
      way('Ivory', 0xa8a294, 0x7e796e, 0xe0dacb, 0xc8bc9c, 0xffd06a, 0xfff6dc, 0xf6f0e0, 0xffe6a6),
      way('Jade', 0x2e5a48, 0x1f4032, 0x7aa490, 0x3a8a6a, 0x6affb0, 0xe0fff0, 0xd6eadc, 0xaaffd4),
    ],
  },
  {
    id: 'fulgurax',
    name: 'Titanus Fulgurax',
    epithet: 'The Storm Herald',
    blurb: 'Crystal-quilled striker: a flared frill, forearm blades and quills that crackle with stored charge.',
    design: FULGURAX_DESIGN,
    profile: {
      height: 112, length: 200, weight: 58000,
      classification: 'Bioelectric crystal striker',
      origin: 'Crystal caverns beneath the Salar de Uyuni',
      abilities: ['Turns on a dime', 'Quick blade-arm strikes', 'Brittle crystal frame'],
      ratings: { power: 3, armor: 1, speed: 4, agility: 5, beam: 2 },
    },
    colors: [
      way('Thunderhead', 0x2f3a4a, 0x202834, 0x6f7f93, 0xbfe6ff, 0x6fd0ff, 0xe8f8ff, 0xdde8f2, 0xe8f8ff),
      way('Amethyst', 0x3a2e4a, 0x281f34, 0x857094, 0xe0c0ff, 0xc07aff, 0xf4e6ff, 0xe8def2, 0xf0d8ff),
      way('Citrine', 0x4a4230, 0x342e20, 0x988a6a, 0xfff0a0, 0xffe04a, 0xfffadc, 0xf2ecd6, 0xfff4b0),
      way('Rose Quartz', 0x5a3e48, 0x3e2a32, 0xa88894, 0xffd0e0, 0xff7ab0, 0xffe6f0, 0xf2e2e8, 0xffc8dc),
      way('Emerald', 0x24443a, 0x182e28, 0x6a9484, 0xb0ffd8, 0x3affa0, 0xdcfff0, 0xd6ece2, 0xb0ffd8),
      way('Obsidian Storm', 0x1a1a20, 0x101014, 0x44444e, 0xffffff, 0xf0f4ff, 0xffffff, 0xe0e0e8, 0xffffff),
    ],
  },
];

export interface TitanChoice {
  titan: TitanId;
  color: number;
}

export const DEFAULT_CHOICE: TitanChoice = { titan: 'tidecaller', color: 0 };

export function rosterTitan(id: TitanId): RosterTitan {
  return ROSTER.find((t) => t.id === id) ?? ROSTER[0]!;
}

/** The chosen titan's design with its colorway applied. */
export function designFor(choice: TitanChoice): TitanDesign {
  const t = rosterTitan(choice.titan);
  const c = t.colors[choice.color] ?? t.colors[0]!;
  return { ...t.design, palette: c.palette, glowColor: c.glow };
}

export function colorwayFor(choice: TitanChoice): TitanColorway {
  const t = rosterTitan(choice.titan);
  return t.colors[choice.color] ?? t.colors[0]!;
}

/** Titan choice from ?titan=&color= (invalid values fall back to the default). */
export function parseChoice(search: string): TitanChoice {
  const q = new URLSearchParams(search);
  const id = q.get('titan');
  const titan = ROSTER.find((t) => t.id === id)?.id ?? DEFAULT_CHOICE.titan;
  const n = Number(q.get('color'));
  const color = Number.isInteger(n) && n >= 0 && n < rosterTitan(titan).colors.length ? n : 0;
  return { titan, color };
}

/** The full spec for a roster titan: its design and colorway plus the profile's size and stats. */
export function specFor(choice: TitanChoice): TitanSpec {
  const t = rosterTitan(choice.titan);
  const p = t.profile;
  return {
    name: t.name,
    body: bodyFor(TITAN_BODY, p, t.design.bulk),
    movement: movementFor(TITAN_MOVEMENT, p),
    gait: gaitFor(TITAN_GAIT, p),
    combat: combatFor(COMBAT, p),
    design: designFor(choice),
    weight: p.weight,
  };
}
