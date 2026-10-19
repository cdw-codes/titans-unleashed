import { REGIONS, type RegionsConfig, type RiverDef } from '../../config/regions';
import { TERRAIN } from '../../config/terrain';
import { hashCoords } from '../../core/math';
import { Random } from '../../core/random';
import { coastPoint, shoreDistance, type ShoreDef } from './shore';

type Pt = [number, number];

/**
 * A fresh open-world layout from a seed: a coastline of a random shape and
 * orientation (coast, bay, strait or peninsula) and the classic regions placed
 * around it — the island offshore with its bridge, the power station on the
 * coast, mountains where the land stays open, the airport and river city
 * inland, rivers running out to sea. Placement rules keep regions apart and
 * dry; layouts that break them are re-rolled.
 */
export function generateRegions(seed: number, base: RegionsConfig = REGIONS): RegionsConfig {
  const rng = new Random(hashCoords(seed, 7, 9001));
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = tryLayout(rng, seed, base);
    if (r) return r;
  }
  return base;
}

const TAU = Math.PI * 2;
const dir = (a: number): Pt => [Math.cos(a), Math.sin(a)];

function makeShore(rng: Random): ShoreDef {
  const roll = rng.next();
  const a0 = rng.range(0, TAU);
  const plane = (a: number, c: number): [number, number, number] => [Math.cos(a), Math.sin(a), c];
  const wave = rng.range(450, 950);
  // Coast lines sit well away from the main city so land dominates the play area.
  if (roll < 0.4) return { kind: 'coast', planes: [plane(a0, rng.range(1500, 3800))], wave };
  if (roll < 0.7) {
    return { kind: 'bay', planes: [plane(a0, rng.range(1600, 3600)), plane(a0 + rng.range(1.2, 1.9) * (rng.chance(0.5) ? 1 : -1), rng.range(2600, 4800))], wave };
  }
  if (roll < 0.85) return { kind: 'strait', planes: [plane(a0, rng.range(2600, 4200)), plane(a0 + Math.PI, rng.range(3400, 5200))], wave };
  return {
    kind: 'peninsula',
    planes: [plane(a0, rng.range(2600, 4000)), plane(a0 + Math.PI / 2 + rng.range(-0.2, 0.2), rng.range(3200, 4600)), plane(a0 - Math.PI / 2 + rng.range(-0.2, 0.2), rng.range(3200, 4600))],
    wave,
  };
}

function tryLayout(rng: Random, seed: number, base: RegionsConfig): RegionsConfig | null {
  const seedTerrain = { ...TERRAIN, seed };
  const shore = makeShore(rng);
  const dist = (x: number, z: number) => shoreDistance(shore, seedTerrain.seed, x, z);
  // The main city (origin) must stand on land, clear of the water.
  if (dist(0, 0) > -1150) return null;

  // Mountains: along a direction where the land runs on (no coast within reach).
  const open: number[] = [];
  const reach = shore.kind === 'peninsula' ? 11000 : 9500;
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * TAU;
    if (!coastPoint(dist, a, reach)) open.push(a);
  }
  if (!open.length) return null;
  const mAngle = rng.pick(open) + rng.range(-0.08, 0.08);
  const [mx, mz] = dir(mAngle);
  // A peninsula has one open direction for everything: push its mountains further out.
  const startD = shore.kind === 'peninsula' ? rng.range(7200, 8400) : rng.range(4600, 6200);
  const fullD = startD + rng.range(2000, 2800);
  const alpsAt = (x: number, z: number) => x * mx + z * mz;
  const clearOfAlps = (x: number, z: number, margin: number) => alpsAt(x, z) < startD - margin;

  // Island offshore, parallel to the coast, its bridge somewhere along its length.
  const seaPlane = rng.pick(shore.planes);
  const iAngle = Math.atan2(seaPlane[1], seaPlane[0]) + rng.range(-0.5, 0.5);
  const cp = coastPoint(dist, iAngle);
  if (!cp || !clearOfAlps(cp.x, cp.z, 1500)) return null;
  const halfLength = rng.range(1300, 2100);
  const halfWidth = rng.range(330, 480);
  const gap = rng.range(650, 1050);
  const ix = cp.x + cp.nx * (gap + halfWidth);
  const iz = cp.z + cp.nz * (gap + halfWidth);
  // Long axis along the coast (tangent), so the island lies parallel to the shore.
  const tx = -cp.nz;
  const tz = cp.nx;
  for (const k of [-1, -0.5, 0, 0.5, 1]) {
    if (dist(ix + tx * halfLength * 0.9 * k, iz + tz * halfLength * 0.9 * k) < halfWidth + 150) return null;
  }
  const along = rng.range(-0.4, 0.4) * halfLength;
  const bx = ix + tx * along - cp.nx * halfWidth * 0.8;
  const bz = iz + tz * along - cp.nz * halfWidth * 0.8;
  // Walk back toward land to the mainland end of the bridge.
  let ax = bx;
  let az = bz;
  for (let s = 0; s < 120 && dist(ax, az) > -40; s++) {
    ax -= cp.nx * 25;
    az -= cp.nz * 25;
  }
  if (dist(ax, az) > -40 || Math.hypot(bx - ax, bz - az) > 2400) return null;
  const island = {
    ...base.island,
    x: ix,
    z: iz,
    halfLength,
    halfWidth,
    angle: Math.atan2(tx, tz),
    bridgeZ: az,
    bridge: [ax, az, bx, bz] as const,
  };

  // Power station on the coast, well away from the island: search the seaward directions.
  const ppInland = base.powerPlant.inland + base.powerPlant.radius;
  let plant: Pt | null = null;
  for (let k = 0; k < 20 && !plant; k++) {
    const pl = rng.pick(shore.planes);
    const pp = coastPoint(dist, Math.atan2(pl[1], pl[0]) + rng.range(-1, 1));
    if (!pp || !clearOfAlps(pp.x, pp.z, 1200)) continue;
    const px = pp.x - pp.nx * ppInland;
    const pz = pp.z - pp.nz * ppInland;
    if (Math.hypot(px - ix, pz - iz) > halfLength + 1600 && dist(px, pz) < -base.powerPlant.radius - 80) plant = [px, pz];
  }
  if (!plant) return null;
  const [plantX, plantZ] = plant;
  const powerPlant = { ...base.powerPlant, z: plantZ, at: [plantX, plantZ] as const };

  // Airport and river city inland, on dry land, clear of the mountains and each other.
  const inland = (minR: number, maxR: number, radius: number): Pt | null => {
    for (let k = 0; k < 24; k++) {
      const [ux, uz] = dir(rng.range(0, TAU));
      const r = rng.range(minR, maxR);
      const x = ux * r;
      const z = uz * r;
      if (dist(x, z) < -(radius + 450) && clearOfAlps(x, z, radius + 600)) return [x, z];
    }
    return null;
  };
  const airportR = rng.range(560, 680);
  const ap = inland(2900, 4200, airportR);
  if (!ap) return null;
  const airport = { ...base.airport, x: ap[0], z: ap[1], radius: airportR };
  const cityR = rng.range(800, 1050);
  let rc: Pt | null = null;
  for (let k = 0; k < 16 && !rc; k++) {
    // Far out first; narrow land (peninsulas, straits) falls back to a closer ring.
    const c = k < 10 ? inland(5200, 7600, cityR) : inland(3600, 5400, cityR);
    if (c && Math.hypot(c[0] - ap[0], c[1] - ap[1]) > airportR + cityR + 1200 && Math.hypot(c[0] - plantX, c[1] - plantZ) > cityR + 1500) rc = c;
  }
  if (!rc) return null;
  const riverCity = { ...base.riverCity, x: rc[0], z: rc[1], radius: cityR };

  // Main-city landmarks at different bearings from the center.
  const tA = rng.range(0, TAU);
  const sA = tA + rng.range(Math.PI / 2, (3 * Math.PI) / 2);
  const tR = rng.range(150, 450);
  const sR = rng.range(500, 850);
  const broadcastTower = { x: Math.sin(tA) * tR, z: Math.cos(tA) * tR, height: rng.range(280, 360) };
  const stadium = { x: Math.sin(sA) * sR, z: Math.cos(sA) * sR };

  // River 1: from the mountains, past the main city center, out to sea (clear of the bridge).
  const across: Pt = [-mz, mx];
  const srcOff = rng.range(-2500, 2500);
  const src: Pt = [mx * (fullD + 600) + across[0] * srcOff, mz * (fullD + 600) + across[1] * srcOff];
  const cityPass: Pt = [rng.range(-450, 450), rng.range(-350, 350)];
  const m1 = mouth(rng, dist, shore, [ax, az]);
  if (!m1) return null;
  const r1 = meander(rng, [src, [(src[0] + cityPass[0]) / 2, (src[1] + cityPass[1]) / 2], cityPass, m1[0], m1[1]], 3, 0.16);
  // River 2: from beyond the river city, through it, out to the nearest sea.
  const out = Math.hypot(rc[0], rc[1]) || 1;
  const r2Src: Pt = [rc[0] + (rc[0] / out) * 4500, rc[1] + (rc[1] / out) * 4500];
  const m2 = mouth(rng, dist, shore, [ax, az], [plantX, plantZ]);
  if (!m2) return null;
  const r2 = meander(rng, [r2Src, [rc[0] + rng.range(-200, 200), rc[1] + rng.range(-200, 200)], [(rc[0] + m2[0][0]) / 2, (rc[1] + m2[0][1]) / 2], m2[0], m2[1]], 3, 0.14);

  const rivers: RiverDef[] = [
    { ...base.rivers[0]!, points: r1 },
    { ...(base.rivers[1] ?? base.rivers[0]!), points: r2 },
  ];
  const near = (pts: Pt[], x: number, z: number, d: number) => distToPolyline(pts, x, z) < d;
  if (near(r1, ap[0], ap[1], airportR + 250) || near(r2, ap[0], ap[1], airportR + 250)) return null;
  if (near(r1, plantX, plantZ, base.powerPlant.radius + 400) || near(r2, plantX, plantZ, base.powerPlant.radius + 300)) return null;
  if (near(r1, broadcastTower.x, broadcastTower.z, 160) || near(r1, stadium.x, stadium.z, 260)) return null;
  if (near(r1, ax, az, 500) || near(r2, ax, az, 500)) return null;

  return {
    ...base,
    shore,
    island,
    riverCity,
    airport,
    powerPlant,
    alps: { ...base.alps, startZ: startD, fullZ: fullD, dir: [mx, mz] },
    rivers,
    broadcastTower,
    stadium,
  };
}

/** A river mouth: a coast point in a random seaward direction, away from `avoid` points. Returns [bank, out at sea]. */
function mouth(rng: Random, dist: (x: number, z: number) => number, shore: ShoreDef, ...avoid: Pt[]): [Pt, Pt] | null {
  for (let k = 0; k < 12; k++) {
    const pl = rng.pick(shore.planes);
    const cp = coastPoint(dist, Math.atan2(pl[1], pl[0]) + rng.range(-0.7, 0.7));
    if (!cp || avoid.some(([x, z]) => Math.hypot(cp.x - x, cp.z - z) < 900)) continue;
    return [
      [Math.round(cp.x - cp.nx * 250), Math.round(cp.z - cp.nz * 250)],
      [Math.round(cp.x + cp.nx * 900), Math.round(cp.z + cp.nz * 900)],
    ];
  }
  return null;
}

/** Midpoint displacement: each pass inserts a sideways-jittered point in every segment. */
function meander(rng: Random, pts: Pt[], passes: number, amount: number): Pt[] {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const next: Pt[] = [cur[0]!];
    for (let i = 0; i < cur.length - 1; i++) {
      const [ax, az] = cur[i]!;
      const [bx, bz] = cur[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az) || 1;
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
