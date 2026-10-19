import { DESTRUCTION as D } from '../../config/destruction';
import { DUST } from '../../config/effects';
import type { GameEventBus } from '../../core/events';
import type { Titan } from '../../entities/titan/Titan';
import type { ChunkManager, Structure } from '../../world/city/ChunkManager';
import type { DustSystem } from '../effects/DustSystem';
import type { CollapseSystem } from './CollapseSystem';
import type { DebrisSystem } from './DebrisSystem';
import { collapseTrauma, impactDamage, pointsFor, pushDamage } from './damage';

export interface DestructionFeedback {
  hitPause(seconds: number): void;
  /** World position of the camera, for distance-based shake. */
  cameraDistanceTo(x: number, z: number): number;
  addTrauma(amount: number): void;
}

/**
 * Gameplay side of destruction (fixed tick): body contact and footsteps damage
 * large structures; anything small the titan walks over or steps on is crushed.
 * Hands visuals to CollapseSystem / DebrisSystem / DustSystem.
 */
export class DestructionSystem {
  private time = 0;
  /** Structures damaged recently (for debug HP labels). */
  readonly recentlyDamaged = new Set<Structure>();

  constructor(
    private readonly chunks: ChunkManager,
    private readonly collapse: CollapseSystem,
    private readonly debris: DebrisSystem,
    private readonly dust: DustSystem,
    private readonly events: GameEventBus,
    private readonly feedback: DestructionFeedback,
  ) {
    events.on('titan:footstep', (e) => {
      if (!e.remote) this.onFootstep(e.x, e.z, e.scale, e.isPlayer);
    });
  }

  /** Advance the shared clock once per tick (before per-titan updates). */
  tick(dt: number): void {
    this.time += dt;
  }

  /** Body contact and walk-through crushing for one titan. */
  fixedUpdate(dt: number, titan: Titan): void {
    const pos = titan.position;
    const byPlayer = titan.isPlayer;

    // Pushing into large structures.
    for (const handle of titan.contacts) {
      const s = this.chunks.structureForCollider(handle);
      if (!s || s.state !== 'intact') continue;
      let dmg = pushDamage(dt, titan.motor.sprinting, D);
      if (this.time - s.lastContact > D.impactCooldown) {
        dmg += impactDamage(titan.impactSpeed, D);
        this.chip(s, pos.x, pos.z, 3);
        if (byPlayer) this.feedback.addTrauma(0.12 + titan.impactSpeed * 0.01);
      } else if (Math.random() < dt * 4) {
        this.chip(s, pos.x, pos.z, 1);
      }
      s.lastContact = this.time;
      this.damage(s, dmg, pos.x, pos.z, byPlayer);
    }

    // Walking through small structures and props crushes them; rivals plow through big ones too.
    const bodyR = titan.spec.body.capsuleRadius * D.bodyCrushRadiusScale;
    this.chunks.forEachNear(pos.x, pos.z, bodyR, (s) => {
      if (s.spec.size !== 'large') this.crush(s, byPlayer);
      else if (titan.plowsThrough) {
        if (Math.random() < dt * 5) this.chip(s, pos.x, pos.z, 1);
        this.damage(s, D.plowDps * dt, pos.x, pos.z, byPlayer);
      }
    });
  }

  private onFootstep(x: number, z: number, scale: number, byPlayer: boolean): void {
    const r = D.footCrushRadius * scale;
    this.chunks.forEachNear(x, z, r, (s) => {
      if (s.spec.size === 'large') this.damage(s, D.footstepDamage, x, z, byPlayer);
      else this.crush(s, byPlayer);
    });
  }

  /** Damage a large structure; collapses it at 0 HP. Used by contact, footsteps and combat. */
  damage(s: Structure, amount: number, fromX: number, fromZ: number, byPlayer = true): void {
    s.hp -= amount;
    this.recentlyDamaged.add(s);
    if (s.hp > 0) {
      this.chunks.tintDamage(s);
      return;
    }
    this.recentlyDamaged.delete(s);
    const st = s.spec;
    this.collapse.start(s, st.x - fromX, st.z - fromZ);
    if (st.height >= D.hitPauseMinHeight) this.feedback.hitPause(D.hitPauseSeconds);
    this.feedback.addTrauma(collapseTrauma(st.height, this.feedback.cameraDistanceTo(st.x, st.z), D));
    this.emitDestroyed(s, byPlayer);
  }

  /** Instantly destroy a small structure or prop. */
  crush(s: Structure, byPlayer = true): void {
    const st = s.spec;
    this.chunks.destroyInstant(s);
    if (st.size === 'small') {
      this.dust.burst(st.x, st.y, st.z, DUST.collapse, Math.min(1.2, Math.max(st.halfW, st.halfD) / 8));
      for (let i = 0; i < 2; i++) this.chipAt(st.x, st.y + st.height * 0.5, st.z, st.parts[0]?.color ?? 0x999999, 2 + Math.random() * 2);
    } else {
      this.dust.burst(st.x, st.y, st.z, DUST.crush, 0.8);
    }
    this.emitDestroyed(s, byPlayer);
  }

  /**
   * Another player destroyed structure `index` of chunk (cx, cz): wreck it here too
   * (not credited), or just remember it if that chunk isn't loaded.
   */
  destroyRemote(cx: number, cz: number, index: number, fromX: number, fromZ: number): void {
    const s = this.chunks.structureAt(cx, cz, index);
    if (!s) return this.chunks.markDestroyed(cx, cz, index);
    if (s.state !== 'intact') return;
    if (s.spec.size === 'large') this.damage(s, Infinity, fromX, fromZ, false);
    else this.crush(s, false);
  }

  /** Small debris knocked off a structure's face toward the titan. */
  chip(s: Structure, fromX: number, fromZ: number, count: number): void {
    const st = s.spec;
    const dx = fromX - st.x;
    const dz = fromZ - st.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = st.x + (dx / len) * Math.max(st.halfW, st.halfD);
    const fz = st.z + (dz / len) * Math.max(st.halfW, st.halfD);
    for (let i = 0; i < count; i++) {
      this.chipAt(fx, st.y + st.height * (0.3 + Math.random() * 0.6), fz, st.parts[0]?.color ?? 0x999999, 2 + Math.random() * 3);
    }
    this.dust.burst(fx, st.y, fz, DUST.crush, 1.2);
  }

  private chipAt(x: number, y: number, z: number, color: number, size: number): void {
    this.debris.spawn({
      x, y, z,
      vx: (Math.random() - 0.5) * 12,
      vy: Math.random() * 5,
      vz: (Math.random() - 0.5) * 12,
      size,
      color,
    });
  }

  private emitDestroyed(s: Structure, byPlayer: boolean): void {
    const st = s.spec;
    this.events.emit('structure:destroyed', {
      kind: st.kind,
      size: st.size,
      x: st.x,
      z: st.z,
      height: st.height,
      points: pointsFor(st, D),
      byPlayer,
      cx: s.chunk.cx,
      cz: s.chunk.cz,
      index: s.index,
    });
  }
}
