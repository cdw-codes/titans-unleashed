import type { RivalId } from '../../config/rivals';
import { PLAYER_DESIGN, THORNMAW_DESIGN, VESPERION_DESIGN, type TitanDesign } from './designs';

export type TitanId = 'tidecaller' | 'thornmaw' | 'vesperion';

export interface TitanColorway {
  readonly name: string;
  readonly palette: TitanDesign['palette'];
  readonly glow: number;
  /** Beam core / glow (the beam takes the titan's glow). */
  readonly beam: { core: number; glow: number };
}

export interface RosterTitan {
  readonly id: TitanId;
  readonly name: string;
  readonly blurb: string;
  readonly design: TitanDesign;
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
    name: 'Tidecaller',
    blurb: 'Atomic lizard risen from the deep: glowing dorsal plates and a charged breath beam.',
    design: PLAYER_DESIGN,
    colors: [
      way('Abyss', 0x4a5e4f, 0x37463b, 0x7d7660, 0xa8bcc4, 0x58d8ff, 0xd8fbff),
      way('Obsidian', 0x2f3236, 0x1f2124, 0x5a5650, 0x9aa3ad, 0x7dffb0, 0xe2ffef),
      way('Coral', 0x8a5a4a, 0x5e3c31, 0xc8a78a, 0xf0d2c0, 0xff8a5c, 0xffe4d6),
      way('Glacier', 0x8fa3b0, 0x657783, 0xd8dde0, 0xe9f6ff, 0x9fd8ff, 0xf2fbff),
      way('Moss', 0x5b6b2f, 0x404b20, 0xa59a62, 0xd8e08a, 0xd6ff5c, 0xf6ffd8),
    ],
  },
  {
    id: 'thornmaw',
    name: 'Thornmaw',
    blurb: 'Hunched, horned brawler with huge arms and ember-lit spikes.',
    design: THORNMAW_DESIGN,
    rival: 'thornmaw',
    colors: [
      way('Ember', 0x6b3a2c, 0x47261c, 0x9c7a5a, 0x2d221d, 0xff6a1a, 0xffe2c4, 0xe8d9b8, 0xffd27a),
      way('Basalt', 0x3b3a39, 0x262524, 0x77706a, 0x161514, 0xff3b2f, 0xffd6cc, 0xe8d9b8, 0xffb37a),
      way('Sandstorm', 0x9a7b4f, 0x6e5636, 0xd2b98a, 0x4a3a26, 0xffc23a, 0xfff0c4, 0xf2e6c8, 0xffe7a0),
      way('Toxic', 0x4d5a2b, 0x323c1b, 0x8c8a52, 0x1e2412, 0xb6ff3a, 0xf0ffd0, 0xe8e2b8, 0xe6ff7a),
      way('Bloodmoon', 0x5a1f22, 0x3c1416, 0x8a5a54, 0x1c0e0e, 0xff2a4a, 0xffd0d8, 0xe8d0c8, 0xff9aa8),
    ],
  },
  {
    id: 'vesperion',
    name: 'Vesperion',
    blurb: 'Tall, long-necked titan with a fan crest and plasma orbs on its shoulders.',
    design: VESPERION_DESIGN,
    rival: 'vesperion',
    colors: [
      way('Dusk', 0x3e3a55, 0x2a2740, 0x8a86a6, 0xc9b8ff, 0xb05cff, 0xf3dcff, 0xd8d2f0, 0xf2a6ff),
      way('Aurora', 0x2e4a52, 0x1f3238, 0x7fa6a8, 0xb8fff0, 0x3dffd0, 0xd8fff6, 0xd2f0ec, 0xa6fff0),
      way('Pearl', 0x8c8794, 0x625e6a, 0xd6d2dc, 0xffffff, 0xffb8ec, 0xfff0fa, 0xf0ecf6, 0xffd6f4),
      way('Nightglass', 0x1d1f2e, 0x12131d, 0x4a4c66, 0x8890ff, 0x5c6cff, 0xdce0ff, 0xc8ccf0, 0xa6b0ff),
      way('Solar', 0x6a4a1e, 0x4a3214, 0xb08a52, 0xffe08a, 0xffb02a, 0xfff2cc, 0xf6e6c0, 0xffe2a0),
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
