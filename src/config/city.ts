/**
 * Procedural city layout. Chunk = 2x2 blocks; streets run along chunk-local
 * x/z = 0 and = blockSize + streetWidth. Heights in m.
 */
export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface CityConfig {
  readonly seed: number;
  readonly blockSize: number;
  readonly streetWidth: number;
  /** Player spawn (m) and a radius kept free of structures. */
  readonly spawnX: number;
  readonly spawnZ: number;
  readonly spawnClearRadius: number;

  // Districts
  /** Towers inside this radius from the origin; tallest at the center. */
  readonly downtownRadius: number;
  /** Mid-rise ring out to this radius; suburbs beyond. */
  readonly fringeRadius: number;
  /** Sea starts east of this x; docks occupy the band just before it. */
  readonly coastX: number;
  readonly docksWidth: number;
  readonly industrialNoiseScale: number;
  /** Noise value (0..1) above which an outer chunk is industrial. */
  readonly industrialThreshold: number;
  readonly industrialMinRadius: number;

  // Building shapes
  readonly towerHeightCenter: Range;
  readonly towerHeightEdge: Range;
  readonly midriseHeight: Range;
  readonly shopHeight: Range;
  readonly houseHeight: Range;
  readonly warehouseHeight: Range;
  readonly chimneyHeight: Range;
  readonly tankHeight: Range;
  /** Parked cars per 100 m of curb. */
  readonly carDensity: Readonly<Record<'downtown' | 'fringe' | 'suburbs' | 'industrial' | 'docks', number>>;

  // Streaming
  /** Building colliders only exist within this radius (m). */
  readonly physicsRadius: number;
  /** Chunk loads per frame (spreads generation cost). */
  readonly chunkLoadsPerFrame: number;
  /** Extra chunks of slack before a loaded chunk is unloaded (prevents thrashing). */
  readonly unloadHysteresis: number;
}

export const CITY: CityConfig = {
  seed: 20261016,
  blockSize: 100,
  streetWidth: 28,
  spawnX: 64,
  spawnZ: -1000,
  spawnClearRadius: 70,

  downtownRadius: 560,
  fringeRadius: 1150,
  coastX: 1800,
  docksWidth: 420,
  industrialNoiseScale: 1 / 1100,
  industrialThreshold: 0.62,
  industrialMinRadius: 1200,

  towerHeightCenter: { min: 150, max: 260 },
  towerHeightEdge: { min: 60, max: 120 },
  midriseHeight: { min: 18, max: 55 },
  shopHeight: { min: 6, max: 10 },
  houseHeight: { min: 5, max: 7.5 },
  warehouseHeight: { min: 10, max: 18 },
  chimneyHeight: { min: 35, max: 65 },
  tankHeight: { min: 9, max: 15 },
  carDensity: { downtown: 5, fringe: 4, suburbs: 2, industrial: 1.5, docks: 1 },

  physicsRadius: 650,
  chunkLoadsPerFrame: 3,
  unloadHysteresis: 1,
};
