import { wrapAngle } from '../core/math';
import type { TitanState } from './protocol';

interface Snapshot {
  time: number;
  s: TitanState;
}

/** Interpolated pose of a remote titan (see Titan.applyRemote). */
export interface Sample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  sprinting: boolean;
  state: string;
  t: number;
  side: 1 | -1;
  charge: number;
  move: string | null;
  beam: { x: number; y: number; z: number } | null;
  hp: number;
}

/**
 * Remote titan states stamped with their local arrival time, sampled a little in
 * the past so there are (almost) always two to interpolate between. Pure: no DOM.
 */
export class SnapshotBuffer {
  private readonly snaps: Snapshot[] = [];

  constructor(private readonly capacity = 24) {}

  get size(): number {
    return this.snaps.length;
  }

  push(time: number, s: TitanState): void {
    this.snaps.push({ time, s });
    if (this.snaps.length > this.capacity) this.snaps.shift();
  }

  /** Pose at `time` into `out`; false if nothing has arrived yet. Holds the last pose past the newest. */
  sample(time: number, out: Sample): boolean {
    const n = this.snaps.length;
    if (n === 0) return false;
    let i = n - 1;
    while (i > 0 && this.snaps[i]!.time > time) i--;
    const a = this.snaps[i]!;
    const b = this.snaps[Math.min(n - 1, i + 1)]!;
    const span = b.time - a.time;
    const k = span > 0 ? Math.min(1, Math.max(0, (time - a.time) / span)) : 0;
    const sa = a.s;
    const sb = b.s;
    out.x = sa.p[0] + (sb.p[0] - sa.p[0]) * k;
    out.y = sa.p[1] + (sb.p[1] - sa.p[1]) * k;
    out.z = sa.p[2] + (sb.p[2] - sa.p[2]) * k;
    out.yaw = sa.y + wrapAngle(sb.y - sa.y) * k;
    out.speed = sa.v + (sb.v - sa.v) * k;
    out.hp = sa.hp + (sb.hp - sa.hp) * k;
    // Discrete action from the older snapshot; its clock keeps running between packets.
    const [t, side, charge, move] = sa.a;
    out.sprinting = sa.r;
    out.state = sa.st;
    out.side = side;
    out.move = move;
    out.charge = charge;
    out.t = t + Math.max(0, time - a.time);
    // Same action in both: their own clocks agree better than ours.
    if (sb !== sa && sb.st === sa.st && sb.a[3] === move && sb.a[0] >= t) out.t = t + (sb.a[0] - t) * k;
    const beam = sa.b ?? sb.b;
    out.beam = beam ? (out.beam ?? { x: 0, y: 0, z: 1 }) : null;
    if (beam && out.beam) {
      out.beam.x = beam[3];
      out.beam.y = beam[4];
      out.beam.z = beam[5];
    }
    return true;
  }
}
