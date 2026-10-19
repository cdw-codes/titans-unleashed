/**
 * Hand-authored world layout: real-world-inspired regions placed around the main
 * city, so every direction has its own character. Buildings and landmarks are
 * original designs; only the geography and names echo real places.
 * Positions in m (x east, z south: north is -z). Procedural satellite towns fill
 * the rest of the world outside these regions.
 */
import type { ShoreDef } from '../world/terrain/shore';

export interface RiverDef {
  readonly name: string;
  /** Polyline from source to mouth. */
  readonly points: readonly (readonly [number, number])[];
  readonly width: number;
}

export interface RegionsConfig {
  /** The main city (at the origin, radius from config/terrain.ts). */
  readonly mainName: string;
  /** Offshore island city: a rotated ellipse of land with a supertall downtown. */
  readonly island: {
    readonly name: string;
    readonly x: number;
    readonly z: number;
    readonly halfLength: number;
    readonly halfWidth: number;
    /** Rotation (rad) of the long axis away from north-south. */
    readonly angle: number;
    /** z of the suspension bridge to the mainland (classic layout: the bridge runs east-west). */
    readonly bridgeZ: number;
    /** Generated worlds: bridge end points [mainland x, z, island x, z] at any angle. */
    readonly bridge?: readonly [number, number, number, number];
  };
  /** River city to the west: dense mid-rise, few towers, many bridges. */
  readonly riverCity: { readonly name: string; readonly x: number; readonly z: number; readonly radius: number };
  /** Mountain range across the north. */
  readonly alps: {
    readonly name: string;
    /**
     * Mountains start rising at `startZ` and reach full height by `fullZ`, measured along
     * `dir` (unit [x, z]) from the origin; without `dir` they are plain z values.
     */
    readonly startZ: number;
    readonly fullZ: number;
    readonly dir?: readonly [number, number];
    readonly height: number;
    readonly size: number;
    /** Snow above this height (m). */
    readonly snowLine: number;
  };
  readonly airport: { readonly name: string; readonly x: number; readonly z: number; readonly radius: number };
  /** Coastal power station: at this z just inland of the coastline, or at `at` (generated worlds). */
  readonly powerPlant: { readonly name: string; readonly z: number; readonly radius: number; readonly inland: number; readonly at?: readonly [number, number] };
  /** Generated worlds: the coastline (see world/terrain/shore.ts); classic = straight east coast. */
  readonly shore?: ShoreDef;
  readonly rivers: readonly RiverDef[];
  /** Depth (m) of river beds below town level. */
  readonly riverDepth: number;
  /** Landmarks inside the main city: block centers near these points are replaced. */
  readonly broadcastTower: { readonly x: number; readonly z: number; readonly height: number };
  readonly stadium: { readonly x: number; readonly z: number };
  /** Satellite towns keep this far from every authored region (m). */
  readonly clearance: number;
}

export const REGIONS: RegionsConfig = {
  mainName: 'Tokyo Bay',
  island: { name: 'Manhattan', x: 2550, z: 1900, halfLength: 1900, halfWidth: 430, angle: 0.12, bridgeZ: 1350 },
  riverCity: { name: 'London', x: -6300, z: 1300, radius: 950 },
  alps: { name: 'The Alps', startZ: -5200, fullZ: -7600, height: 620, size: 1300, snowLine: 330 },
  airport: { name: 'International Airport', x: -3300, z: -1700, radius: 620 },
  powerPlant: { name: 'Seaside Power Station', z: 5600, radius: 330, inland: 260 },
  rivers: [
    {
      name: 'Sumida',
      width: 150,
      points: [[-2300, -8200], [-1700, -5600], [-1250, -3600], [-650, -1500], [60, -260], [700, 420], [1500, 650], [2400, 760]],
    },
    {
      name: 'Thames',
      width: 170,
      points: [[-10200, 2600], [-8000, 1900], [-7000, 650], [-6150, 1650], [-5450, 900], [-4400, 2000], [-2900, 3300], [-900, 4400], [900, 4900], [2600, 5000]],
    },
  ],
  riverDepth: 14,
  broadcastTower: { x: -360, z: 330, height: 330 },
  stadium: { x: 640, z: -700 },
  clearance: 900,
};
