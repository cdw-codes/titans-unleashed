/** Military harassment. Distances m, times s. Index 0 of per-level arrays = threat level 1. */
export interface ThreatConfig {
  /** Heat needed for threat levels 1..5 (heat = player destruction points). */
  readonly levelThresholds: readonly number[];
  /** Seconds without player destruction before heat starts to cool. */
  readonly calmDelay: number;
  /** Heat lost per second while calm: a fraction of current heat plus a flat amount. */
  readonly decayFraction: number;
  readonly decayFlat: number;
  /** Heat cap (so it can cool down in reasonable time). */
  readonly maxHeat: number;
}

export interface MilitaryLevelConfig {
  readonly maxTanks: readonly number[];
  readonly maxHelis: readonly number[];
  /** Seconds between reinforcements while below the cap. */
  readonly spawnInterval: readonly number[];
  /** 0..1: 1 = every shot lands on the titan's chest. */
  readonly accuracy: readonly number[];
}

export interface TankConfig {
  readonly speed: number;
  /** Spawn ring around the player (m). */
  readonly spawnMin: number;
  readonly spawnMax: number;
  /** Distance they drive in to before stopping to fire. */
  readonly preferredRange: number;
  readonly fireRange: number;
  readonly reload: number;
  readonly turretTurnRate: number;
  readonly shellSpeed: number;
  readonly damage: number;
  readonly poiseDamage: number;
  /** Shell blast vs structures when it misses. */
  readonly missStructureDamage: number;
  /** Max aim error (m) at accuracy 0. */
  readonly spread: number;
  readonly length: number;
  readonly points: number;
  readonly energy: number;
}

export interface HeliConfig {
  readonly speed: number;
  readonly spawnDistance: number;
  readonly orbitRadius: number;
  /** Attack runs swoop in to this radius. */
  readonly attackRadius: number;
  readonly altitudeMin: number;
  readonly altitudeMax: number;
  readonly fireRange: number;
  readonly reload: number;
  readonly rocketsPerVolley: number;
  readonly rocketInterval: number;
  readonly rocketSpeed: number;
  readonly damage: number;
  readonly poiseDamage: number;
  readonly missStructureDamage: number;
  readonly spread: number;
  /** Hit sphere radius (m) for swats and the beam: generous on purpose. */
  readonly hitRadius: number;
  readonly crashBlastRadius: number;
  readonly points: number;
  readonly energy: number;
}

export interface MilitaryConfig {
  readonly threat: ThreatConfig;
  readonly levels: MilitaryLevelConfig;
  readonly tank: TankConfig;
  readonly heli: HeliConfig;
  /** Units farther than this from the player are recycled. */
  readonly despawnDistance: number;
  /** Roar: tanks in range stop firing this long; helicopters in range crash. */
  readonly roarTankStun: number;
}

export const MILITARY: MilitaryConfig = {
  threat: {
    levelThresholds: [300, 2000, 5000, 10000, 18000],
    calmDelay: 15,
    decayFraction: 0.05,
    decayFlat: 25,
    maxHeat: 25000,
  },
  levels: {
    maxTanks: [3, 6, 10, 14, 18],
    maxHelis: [0, 1, 2, 4, 6],
    spawnInterval: [8, 6, 5, 4, 3],
    accuracy: [0.4, 0.5, 0.6, 0.7, 0.8],
  },
  tank: {
    speed: 12,
    spawnMin: 550,
    spawnMax: 850,
    preferredRange: 320,
    fireRange: 650,
    reload: 3.5,
    turretTurnRate: 1.2,
    shellSpeed: 320,
    damage: 5,
    poiseDamage: 3,
    missStructureDamage: 40,
    spread: 35,
    length: 10,
    points: 60,
    energy: 1,
  },
  heli: {
    speed: 45,
    spawnDistance: 1000,
    orbitRadius: 300,
    attackRadius: 140,
    altitudeMin: 95,
    altitudeMax: 150,
    fireRange: 500,
    reload: 4,
    rocketsPerVolley: 2,
    rocketInterval: 0.25,
    rocketSpeed: 180,
    damage: 8,
    poiseDamage: 5,
    missStructureDamage: 60,
    spread: 30,
    hitRadius: 16,
    crashBlastRadius: 25,
    points: 150,
    energy: 2,
  },
  despawnDistance: 1400,
  roarTankStun: 4,
};
