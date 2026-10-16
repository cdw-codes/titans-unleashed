export interface RespawnInput {
  /** Where the player went down. */
  fromX: number;
  fromZ: number;
  /** The threat to get away from (rival), or null for a random direction. */
  threat: { x: number; z: number } | null;
  minDistance: number;
  /** Stay this far west of the coast. */
  maxX: number;
  /** Street grid pitch: intersections are building-free. */
  pitch: number;
  rand: () => number;
}

/**
 * A fair respawn spot: `minDistance` away from the threat (or the death spot),
 * heading inland if that would reach the sea, snapped to a street intersection
 * so the kaiju never respawns inside a building.
 */
export function respawnPoint(i: RespawnInput): { x: number; z: number; yaw: number } {
  let dx: number;
  let dz: number;
  if (i.threat) {
    dx = i.fromX - i.threat.x;
    dz = i.fromZ - i.threat.z;
  } else {
    const a = i.rand() * Math.PI * 2;
    dx = Math.sin(a);
    dz = Math.cos(a);
  }
  let len = Math.hypot(dx, dz);
  if (len < 1e-3) {
    dx = -1;
    dz = 0;
    len = 1;
  }
  dx /= len;
  dz /= len;
  const ox = i.threat ? i.threat.x : i.fromX;
  const oz = i.threat ? i.threat.z : i.fromZ;
  let x = ox + dx * i.minDistance;
  let z = oz + dz * i.minDistance;
  if (x > i.maxX) {
    // Would land in the sea: swing the direction inland.
    dx = -Math.abs(dx);
    x = ox + dx * i.minDistance;
    z = oz + dz * i.minDistance;
    x = Math.min(x, i.maxX);
  }
  // Snap outward to the next intersection so snapping never brings us closer.
  const snap = (v: number, d: number) => (d >= 0 ? Math.ceil(v / i.pitch) : Math.floor(v / i.pitch)) * i.pitch;
  x = snap(x, dx);
  z = snap(z, dz);
  if (x > i.maxX) x = Math.floor(i.maxX / i.pitch) * i.pitch;
  // Face back toward where the fight was.
  const yaw = Math.atan2(ox - x, oz - z);
  return { x, z, yaw };
}
