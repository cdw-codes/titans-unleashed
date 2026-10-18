/**
 * The land the city sits on: towns, hills, lakes, coast, biomes and their colors.
 * Distances/heights in m; `*Size` values are noise feature sizes (m).
 * Changing anything here reshapes the world (destroyed buildings are keyed by index).
 */
export interface TerrainRange {
  readonly min: number;
  readonly max: number;
}

export interface TerrainConfig {
  readonly seed: number;

  // Towns: the main city at the origin plus satellite towns on a jittered grid.
  readonly mainCityRadius: number;
  /** Grid cell (m) holding at most one satellite town. */
  readonly townCell: number;
  readonly townChance: number;
  readonly townRadius: TerrainRange;
  /** Minimum open countryside between a satellite town and the main city. */
  readonly townGap: number;
  /** Fraction of satellite towns built around industry instead of a village core. */
  readonly worksChance: number;
  /** Ground stays flat this far past a town's edge... */
  readonly flatMargin: number;
  /** ...then the hills rise over this distance. */
  readonly blendWidth: number;

  // Relief
  readonly hillSize: number;
  readonly hillHeight: number;
  readonly ridgeSize: number;
  readonly ridgeHeight: number;
  /** Noise value (0..1) where ridges start rising. */
  readonly ridgeStart: number;
  readonly detailSize: number;
  readonly detailHeight: number;

  // Water
  /** Surface height of the sea and lakes; towns sit at 0. */
  readonly waterLevel: number;
  readonly lakeSize: number;
  /** Noise value (0..1) above which the ground dips into a lake. */
  readonly lakeThreshold: number;
  readonly lakeDepth: number;
  /** Mean coastline x (sea to the east), its wobble amplitude and wavelength. */
  readonly coastX: number;
  readonly coastWave: number;
  readonly coastWaveSize: number;
  /** Width of the low sandy strip before the coastline, and of the slope down to the seabed. */
  readonly beachWidth: number;
  readonly shelfWidth: number;
  readonly seaDepth: number;

  // Biomes
  readonly forestSize: number;
  /** Noise value (0..1) where forest begins; density keeps rising past it. */
  readonly forestThreshold: number;
  readonly farmSize: number;
  readonly farmThreshold: number;
  /** Size (m) of one crop field in the patchwork. */
  readonly fieldSize: number;
  /** Country roads every N street pitches, outside towns. */
  readonly countryRoadEvery: number;
  /** Slope (rise / run) above which bare rock shows. */
  readonly rockSlope: number;
  readonly rockHeight: number;
  /** Trees per hectare at full forest density. */
  readonly forestTreesPerHa: number;
  /** Trees per hectare in open meadow (in small clumps). */
  readonly meadowTreesPerHa: number;
}

export const TERRAIN: TerrainConfig = {
  seed: 7713,

  mainCityRadius: 1250,
  townCell: 3000,
  townChance: 0.6,
  townRadius: { min: 300, max: 620 },
  townGap: 700,
  worksChance: 0.35,
  flatMargin: 70,
  blendWidth: 420,

  hillSize: 950,
  hillHeight: 125,
  ridgeSize: 2900,
  ridgeHeight: 230,
  ridgeStart: 0.45,
  detailSize: 210,
  detailHeight: 16,

  waterLevel: -4,
  lakeSize: 1700,
  lakeThreshold: 0.66,
  lakeDepth: 34,
  coastX: 1250,
  coastWave: 500,
  coastWaveSize: 2600,
  beachWidth: 110,
  shelfWidth: 260,
  seaDepth: 32,

  forestSize: 950,
  forestThreshold: 0.5,
  farmSize: 1500,
  farmThreshold: 0.55,
  fieldSize: 96,
  countryRoadEvery: 4,
  rockSlope: 0.55,
  rockHeight: 150,
  forestTreesPerHa: 14,
  meadowTreesPerHa: 1.2,
};

/** Ground palette (sRGB). Autumn colors match the trees. */
export const TERRAIN_COLORS = {
  grass: 0x84a84f,
  grassDark: 0x5f8a3c,
  meadow: 0xd2b45a,
  sand: 0xe2d09a,
  seabed: 0x5f7f7a,
  rock: 0x9b958e,
  rockDark: 0x7d7a80,
  snow: 0xf2f4f8,
  town: 0x93a06a,
  road: 0xb39a6c,
  crops: [0xd9bf62, 0xa3b957, 0xb88a52, 0xc9cf72, 0xe0a94a],
  canopy: [0x5d8b37, 0x3f6d33, 0xd9822b, 0xc54a2e, 0xe0b23a, 0x8f9b3a],
} as const;
