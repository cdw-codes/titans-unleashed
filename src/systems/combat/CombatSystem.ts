import RAPIER from '@dimforge/rapier3d-compat';
import { COMBAT } from '../../config/combat';
import { DUST } from '../../config/effects';
import type { GameEventBus } from '../../core/events';
import type { Kaiju } from '../../entities/kaiju/Kaiju';
import type { AttackEvent } from '../../entities/kaiju/KaijuCombat';
import type { ChunkManager } from '../../world/city/ChunkManager';
import type { PhysicsSystem } from '../PhysicsSystem';
import type { DestructionSystem } from '../destruction/DestructionSystem';
import type { DustSystem } from '../effects/DustSystem';
import { falloffDamage, inArc } from './rules';

export interface CombatFeedback {
  hitPause(seconds: number): void;
  addTrauma(amount: number): void;
  addKick(velocity: number): void;
}

const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

/**
 * Resolves kaiju attacks against the world each fixed tick: area moves (claw,
 * tail, stomp) against structures in their arc, roars, and the beam as a
 * raycast with an impact blast. Damage goes through DestructionSystem.
 */
export class CombatSystem {
  /** Last area attack, for debug hitbox drawing. */
  lastArea: { x: number; z: number; yaw: number; radius: number; arcDeg: number; arcOffsetDeg: number; age: number } | null = null;

  constructor(
    private readonly physics: PhysicsSystem,
    private readonly chunks: ChunkManager,
    private readonly destruction: DestructionSystem,
    private readonly dust: DustSystem,
    private readonly events: GameEventBus,
    private readonly feedback: CombatFeedback,
  ) {}

  fixedUpdate(dt: number, attacker: Kaiju): void {
    if (this.lastArea) this.lastArea.age += dt;
    for (const a of attacker.combat.attacks) this.resolve(a, attacker, dt);
    if (!attacker.combat.isBeamFiring) attacker.combat.beamEnd.hit = false;
  }

  private resolve(a: AttackEvent, attacker: Kaiju, dt: number): void {
    switch (a.type) {
      case 'area':
        return this.area(a, attacker);
      case 'roar':
        return this.roar(a, attacker);
      case 'beam':
        return this.beam(a, attacker, dt);
    }
  }

  private area(a: Extract<AttackEvent, { type: 'area' }>, attacker: Kaiju): void {
    const c = a.cfg;
    const radius = c.radius;
    let hits = 0;
    this.chunks.forEachNear(a.x, a.z, radius, (s) => {
      const st = s.spec;
      const r = Math.max(st.halfW, st.halfD);
      if (!inArc(a.x, a.z, a.yaw, radius, c.arcDeg, c.arcOffsetDeg, st.x, st.z, r)) return;
      hits++;
      if (st.size !== 'large') {
        this.destruction.crush(s);
        return;
      }
      const dist = Math.max(0, Math.hypot(st.x - a.x, st.z - a.z) - r);
      this.destruction.chip(s, a.x, a.z, c.debrisPerHit);
      this.destruction.damage(s, falloffDamage(c.damage, dist, radius, c.edgeFalloff), a.x, a.z);
    });
    this.lastArea = { x: a.x, z: a.z, yaw: a.yaw, radius, arcDeg: c.arcDeg, arcOffsetDeg: c.arcOffsetDeg, age: 0 };

    if (attacker.isPlayer) {
      // Ground slams always shake; swings only shake properly when they connect.
      const connected = hits > 0 || a.move === 'stomp';
      this.feedback.addTrauma(connected ? c.trauma : c.trauma * 0.3);
      this.feedback.addKick(c.kick);
      if (connected && c.hitPause > 0) this.feedback.hitPause(c.hitPause);
    }
    if (a.move === 'stomp') this.dust.burst(a.x, 0, a.z, DUST.collapse, DUST.maxBurstScale);
    this.events.emit('combat:impact', { move: a.move, x: a.x, z: a.z, yaw: a.yaw, radius, hits, isPlayer: attacker.isPlayer });
  }

  private roar(a: Extract<AttackEvent, { type: 'roar' }>, attacker: Kaiju): void {
    const r = COMBAT.roar;
    if (attacker.isPlayer) this.feedback.addTrauma(r.trauma);
    this.events.emit('kaiju:roar', { x: a.x, z: a.z, radius: r.stunRadius, stunSeconds: r.stunSeconds, isPlayer: attacker.isPlayer });
  }

  private beam(a: Extract<AttackEvent, { type: 'beam' }>, attacker: Kaiju, dt: number): void {
    const b = COMBAT.beam;
    _ray.origin.x = a.ox;
    _ray.origin.y = a.oy;
    _ray.origin.z = a.oz;
    _ray.dir.x = a.dx;
    _ray.dir.y = a.dy;
    _ray.dir.z = a.dz;
    const hit = this.physics.world.castRay(
      _ray, b.range, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, attacker.body,
    );
    let toi = hit ? hit.timeOfImpact : b.range;
    // Ground plane (structures beyond the physics radius have no colliders).
    if (a.dy < 0) toi = Math.min(toi, -a.oy / a.dy);
    const end = attacker.combat.beamEnd;
    end.x = a.ox + a.dx * toi;
    end.y = a.oy + a.dy * toi;
    end.z = a.oz + a.dz * toi;
    end.hit = toi < b.range;

    if (hit && hit.timeOfImpact <= toi) {
      const s = this.chunks.structureForCollider(hit.collider.handle);
      if (s && s.state === 'intact') this.destruction.damage(s, a.damage, a.ox, a.oz);
    }
    if (end.hit) {
      // Impact blast: crush small things, singe large ones near the impact.
      const blast = b.impactRadius;
      this.chunks.forEachNear(end.x, end.z, blast, (s) => {
        if (end.y > s.spec.height + blast) return;
        if (s.spec.size !== 'large') this.destruction.crush(s);
        else this.destruction.damage(s, a.damage * b.impactDpsFraction, end.x, end.z);
      });
    }
    if (attacker.isPlayer) this.feedback.addTrauma(b.traumaPerSecond * dt);
  }
}
