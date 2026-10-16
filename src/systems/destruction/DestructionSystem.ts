import { DESTRUCTION as D } from '../../config/destruction';
import { DUST } from '../../config/effects';
import { KAIJU_BODY } from '../../config/kaiju';
import type { GameEventBus } from '../../core/events';
import type { Kaiju } from '../../entities/kaiju/Kaiju';
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
 * large structures; anything small the kaiju walks over or steps on is crushed.
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
    events.on('kaiju:footstep', (e) => this.onFootstep(e.x, e.z, e.scale));
  }

  fixedUpdate(dt: number, kaiju: Kaiju): void {
    this.time += dt;
    const pos = kaiju.position;

    // Pushing into large structures.
    for (const handle of kaiju.contacts) {
      const s = this.chunks.structureForCollider(handle);
      if (!s || s.state !== 'intact') continue;
      let dmg = pushDamage(dt, kaiju.motor.sprinting, D);
      if (this.time - s.lastContact > D.impactCooldown) {
        dmg += impactDamage(kaiju.impactSpeed, D);
        this.chip(s, pos.x, pos.z, 3);
        this.feedback.addTrauma(0.12 + kaiju.impactSpeed * 0.01);
      } else if (Math.random() < dt * 4) {
        this.chip(s, pos.x, pos.z, 1);
      }
      s.lastContact = this.time;
      this.damage(s, dmg, pos.x, pos.z);
    }

    // Walking through small structures and props crushes them.
    const bodyR = KAIJU_BODY.capsuleRadius * D.bodyCrushRadiusScale;
    this.chunks.forEachNear(pos.x, pos.z, bodyR, (s) => {
      if (s.spec.size !== 'large') this.crush(s);
    });
  }

  private onFootstep(x: number, z: number, scale: number): void {
    const r = D.footCrushRadius * scale;
    this.chunks.forEachNear(x, z, r, (s) => {
      if (s.spec.size === 'large') this.damage(s, D.footstepDamage, x, z);
      else this.crush(s);
    });
  }

  /** Damage a large structure; collapses it at 0 HP. Used by contact, footsteps and combat. */
  damage(s: Structure, amount: number, fromX: number, fromZ: number): void {
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
    this.emitDestroyed(s);
  }

  /** Instantly destroy a small structure or prop. */
  crush(s: Structure): void {
    const st = s.spec;
    this.chunks.destroyInstant(s);
    if (st.size === 'small') {
      this.dust.burst(st.x, 0, st.z, DUST.collapse, Math.min(1.2, Math.max(st.halfW, st.halfD) / 8));
      for (let i = 0; i < 2; i++) this.chipAt(st.x, st.height * 0.5, st.z, st.parts[0]?.color ?? 0x999999, 2 + Math.random() * 2);
    } else {
      this.dust.burst(st.x, 0, st.z, DUST.crush, 0.8);
    }
    this.emitDestroyed(s);
  }

  /** Small debris knocked off a structure's face toward the kaiju. */
  chip(s: Structure, fromX: number, fromZ: number, count: number): void {
    const st = s.spec;
    const dx = fromX - st.x;
    const dz = fromZ - st.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = st.x + (dx / len) * Math.max(st.halfW, st.halfD);
    const fz = st.z + (dz / len) * Math.max(st.halfW, st.halfD);
    for (let i = 0; i < count; i++) {
      this.chipAt(fx, st.height * (0.3 + Math.random() * 0.6), fz, st.parts[0]?.color ?? 0x999999, 2 + Math.random() * 3);
    }
    this.dust.burst(fx, 0, fz, DUST.crush, 1.2);
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

  private emitDestroyed(s: Structure): void {
    const st = s.spec;
    this.events.emit('structure:destroyed', {
      kind: st.kind,
      size: st.size,
      x: st.x,
      z: st.z,
      height: st.height,
      points: pointsFor(st, D),
    });
  }
}
