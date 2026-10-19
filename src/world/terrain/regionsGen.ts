import { REGIONS, type RegionsConfig, type RiverDef } from '../../config/regions';
import { hashCoords } from '../../core/math';
import { Random } from '../../core/random';

type Pt = [number, number];

/**
 * A fresh open-world layout from a seed: same regions as the classic layout
 * (config/regions.ts) but placed anew each game — mountains north or south,
 * the island somewhere along the coast, the river city out west, the airport
 * and power station, a river from the mountains through the main city to the
 * sea and one through the river city. Placement rules keep regions apart and
 * out of the mountains; layouts that break them are re-rolled.
 * `coastX(z)` is the coastline for this seed (the sea is always east).
 */
export function generateRegions(seed: number, coastX: (z: number) => number, base: RegionsConfig = REGIONS): RegionsConfig {
  const rng = new Random(hashCoords(seed, 7, 9001));
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = tryLayout(rng, coastX, base);
    if (r) return r;
  }
  return base;
}

function tryLayout(rng: Random, coastX: (z: number) => number, base: RegionsConfig): RegionsConfig | null {
  // Mountains across the north or the south.
  const side = rng.chance(0.5) ? -1 : 1;
  const startZ = side * rng.range(4600, 6200);
  const fullZ = startZ + side * rng.range(2000, 2800);
  const clearOfAlps = (z: number, margin: number) => (side < 0 ? z > startZ + margin : z < startZ - margin);

  // Island offshore, its suspension bridge somewhere along its length.
  const halfLength = rng.range(1300, 2100);
  const halfWidth = rng.range(330, 480);
  const iz = rng.range(-2600, 2600);
  if (!clearOfAlps(iz - side * halfLength, 700)) return null;
  const ix = coastX(iz) + halfWidth + rng.range(650, 1050);
  const island = {
    ...base.island,
    x: ix,
    z: iz,
    halfLength,
    halfWidth,
    angle: rng.range(-0.25, 0.25),
    bridgeZ: iz + rng.range(-0.45, 0.45) * halfLength,
  };

  // River city out west, airport inland between it and the main city.
  const riverCity = { ...base.riverCity, x: rng.range(-7600, -5200), z: rng.range(-3200, 3200), radius: rng.range(800, 1050) };
  // Bearing in the west half (x = sin, z = cos), never straight north or south.
  const aAngle = Math.PI + rng.range(0.3, Math.PI - 0.3);
  const aDist = rng.range(2900, 4200);
  const airport = { ...base.airport, x: Math.sin(aAngle) * aDist, z: Math.cos(aAngle) * aDist, radius: rng.range(560, 680) };
  if (!clearOfAlps(airport.z, airport.radius + 600) || !clearOfAlps(riverCity.z, riverCity.radius + 600)) return null;
  if (Math.hypot(airport.x - riverCity.x, airport.z - riverCity.z) < airport.radius + riverCity.radius + 1200) return null;

  // Power station along the coast, beyond the island on the side away from the mountains.
  const pz = iz - side * (halfLength + rng.range(1400, 2800));
  if (Math.abs(pz) > 8000) return null;
  const powerPlant = { ...base.powerPlant, z: pz };

  // Main-city landmarks at different bearings from the center.
  const tA = rng.range(0, Math.PI * 2);
  const sA = tA + rng.range(Math.PI / 2, (3 * Math.PI) / 2);
  const tR = rng.range(150, 450);
  const sR = rng.range(500, 850);
  const broadcastTower = { x: Math.sin(tA) * tR, z: Math.cos(tA) * tR, height: rng.range(280, 360) };
  const stadium = { x: Math.sin(sA) * sR, z: Math.cos(sA) * sR };

  // River 1: from the mountains, past the main city center, out to sea (avoiding the bridge).
  const srcX = rng.range(-3200, 600);
  const mouthZ = clampAway(rng.range(-1800, 1800), island.bridgeZ, 600);
  const cityPass: Pt = [rng.range(-450, 450), rng.range(-350, 350)];
  const r1 = meander(rng, [[srcX, fullZ + side * 600], [srcX * 0.6 + cityPass[0] * 0.4, (fullZ + cityPass[1]) / 2], cityPass, [coastX(mouthZ) - 200, mouthZ], [coastX(mouthZ) + 900, mouthZ]], 3, 0.18);
  // River 2: from the far west through the river city, east to the sea beyond the power station.
  const r2End = pz + rng.range(700, 1200) * (rng.chance(0.5) ? 1 : -1);
  const r2 = meander(rng, [
    [-11000, riverCity.z + rng.range(-1500, 1500)],
    [riverCity.x + rng.range(-200, 200), riverCity.z + rng.range(-200, 200)],
    [riverCity.x / 2, (riverCity.z + r2End) / 2 + rng.range(-1500, 1500)],
    [coastX(r2End) - 300, r2End],
    [coastX(r2End) + 900, r2End],
  ], 3, 0.15);

  const rivers: RiverDef[] = [
    { ...base.rivers[0]!, points: r1 },
    { ...(base.rivers[1] ?? base.rivers[0]!), points: r2 },
  ];
  // Rivers must miss the airport and the power station, and river 1 the stadium and tower.
  const near = (pts: Pt[], x: number, z: number, d: number) => distToPolyline(pts, x, z) < d;
  if (near(r1, airport.x, airport.z, airport.radius + 250) || near(r2, airport.x, airport.z, airport.radius + 250)) return null;
  const plantX = coastX(pz) - powerPlant.inland - powerPlant.radius;
  if (near(r1, plantX, pz, powerPlant.radius + 400) || near(r2, plantX, pz, powerPlant.radius + 300)) return null;
  if (near(r1, broadcastTower.x, broadcastTower.z, 160) || near(r1, stadium.x, stadium.z, 260)) return null;

  return {
    ...base,
    island,
    riverCity,
    airport,
    powerPlant,
    alps: { ...base.alps, startZ, fullZ },
    rivers,
    broadcastTower,
    stadium,
  };
}

/** Keep `v` at least `gap` away from `avoid`. */
function clampAway(v: number, avoid: number, gap: number): number {
  if (Math.abs(v - avoid) >= gap) return v;
  return v < avoid ? avoid - gap : avoid + gap;
}

/** Midpoint displacement: each pass inserts a sideways-jittered point in every segment. */
function meander(rng: Random, pts: Pt[], passes: number, amount: number): Pt[] {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const next: Pt[] = [cur[0]!];
    for (let i = 0; i < cur.length - 1; i++) {
      const [ax, az] = cur[i]!;
      const [bx, bz] = cur[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const off = rng.range(-amount, amount) * len;
      next.push([(ax + bx) / 2 + (-(bz - az) / len) * off, (az + bz) / 2 + ((bx - ax) / len) * off], cur[i + 1]!);
    }
    cur = next;
  }
  return cur.map(([x, z]) => [Math.round(x), Math.round(z)]);
}

function distToPolyline(pts: Pt[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
