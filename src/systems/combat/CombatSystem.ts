import RAPIER from '@dimforge/rapier3d-compat';
import { DUST } from '../../config/effects';
import type { GameEventBus } from '../../core/events';
import type { Titan } from '../../entities/titan/Titan';
import type { AttackEvent } from '../../entities/titan/TitanCombat';
import type { ChunkManager } from '../../world/city/ChunkManager';
import type { PhysicsSystem } from '../PhysicsSystem';
import type { DestructionSystem } from '../destruction/DestructionSystem';
import type { DustSystem } from '../effects/DustSystem';
import type { ProjectileHit, ProjectileSystem } from './ProjectileSystem';
import type { MilitarySystem } from '../military/MilitarySystem';
import { falloffDamage, inArc } from './rules';
import { terrain } from '../../world/terrain/Terrain';

export interface CombatFeedback {
  hitPause(seconds: number): void;
  addTrauma(amount: number): void;
  addKick(velocity: number): void;
  /** The player took damage (HUD flash). */
  playerHurt(amount: number): void;
}

const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

/**
 * Resolves titan attacks each fixed tick against structures AND other titans:
 * area moves (claw, tail, stomp, lunge) by arc, roars (stun), the beam as a
 * raycast with an impact blast, and volleys handed to ProjectileSystem.
 * Structure damage goes through DestructionSystem, attributed to the player or not.
 */
export class CombatSystem {
  /** Last area attack, for debug hitbox drawing. */
  lastArea: { x: number; z: number; yaw: number; radius: number; arcDeg: number; arcOffsetDeg: number; age: number } | null = null;
  projectiles: ProjectileSystem | null = null;
  /**
   * Hits on a network player's titan are not applied here: its owner applies them
   * (attacker-resolved, sent over the wire). Damage 0 with stun > 0 = a roar stun.
   */
  remoteHit: ((target: Titan, damage: number, poiseDamage: number, stunSeconds: number) => void) | null = null;
  /** Player attacks also hit military units. */
  military: MilitarySystem | null = null;

  constructor(
    private readonly physics: PhysicsSystem,
    private readonly chunks: ChunkManager,
    private readonly destruction: DestructionSystem,
    private readonly dust: DustSystem,
    private readonly events: GameEventBus,
    private readonly feedback: CombatFeedback,
  ) {}

  /** Resolve every titan's attacks this tick. `titans` includes the player. */
  fixedUpdate(dt: number, titans: readonly Titan[]): void {
    if (this.lastArea) this.lastArea.age += dt;
    for (const attacker of titans) {
      for (const a of attacker.combat.attacks) this.resolve(a, attacker, titans, dt);
      if (!attacker.combat.isBeamFiring) attacker.combat.beamEnd.hit = false;
    }
  }

  /** Apply a hit from `owner` to `target` with reactions, events and feedback. */
  hitTitan(target: Titan, owner: Titan | null, damage: number, poiseDamage: number): void {
    if (target.state === 'defeated') return;
    if (target.remote) {
      if (owner?.isPlayer) this.remoteHit?.(target, damage, poiseDamage, 0);
      return;
    }
    const before = target.combat.health.health;
    const reaction = target.combat.takeHit(damage, poiseDamage);
    const dealt = before - target.combat.health.health;
    if (dealt <= 0) return;
    if (target.isPlayer) {
      this.feedback.playerHurt(dealt);
      this.feedback.addTrauma(Math.min(0.6, 0.15 + dealt / 300));
    }
    if (reaction !== 'none') {
      this.events.emit('titan:hurt', { reaction, isPlayer: target.isPlayer, x: target.position.x, z: target.position.z });
    }
    if (owner?.isPlayer && reaction === 'knockdown') this.feedback.hitPause(0.12);
  }

  onProjectileHit = (h: ProjectileHit): void => {
    this.hitTitan(h.target, h.owner, h.damage, h.poiseDamage);
  };

  private resolve(a: AttackEvent, attacker: Titan, titans: readonly Titan[], dt: number): void {
    switch (a.type) {
      case 'area':
        return this.area(a, attacker, titans);
      case 'roar':
        return this.roar(a, attacker, titans);
      case 'beam':
        return this.beam(a, attacker, titans, dt);
      case 'projectile':
        this.projectiles?.spawn(attacker, a.cfg, a.ox, a.oy, a.oz, a.tx, a.ty, a.tz);
        return;
    }
  }

  private area(a: Extract<AttackEvent, { type: 'area' }>, attacker: Titan, titans: readonly Titan[]): void {
    const c = a.cfg;
    const radius = c.radius;
    const byPlayer = attacker.isPlayer;
    const mult = attacker.combat.mods.meleeDamage;
    let hits = 0;
    if (byPlayer && this.military) {
      hits += this.military.hitArc(a.x, a.z, a.yaw, radius, c.arcDeg, c.arcOffsetDeg, attacker.position.y + attacker.spec.body.height * 1.15);
    }
    this.chunks.forEachNear(a.x, a.z, radius, (s) => {
      const st = s.spec;
      const r = Math.max(st.halfW, st.halfD);
      if (!inArc(a.x, a.z, a.yaw, radius, c.arcDeg, c.arcOffsetDeg, st.x, st.z, r)) return;
      hits++;
      if (st.size !== 'large') {
        this.destruction.crush(s, byPlayer);
        return;
      }
      const dist = Math.max(0, Math.hypot(st.x - a.x, st.z - a.z) - r);
      this.destruction.chip(s, a.x, a.z, c.debrisPerHit);
      this.destruction.damage(s, falloffDamage(c.damage, dist, radius, c.edgeFalloff) * mult, a.x, a.z, byPlayer);
    });

    let titanHits = 0;
    for (const t of titans) {
      if (t === attacker || t.state === 'defeated') continue;
      const tr = t.spec.body.capsuleRadius;
      if (!inArc(a.x, a.z, a.yaw, radius, c.arcDeg, c.arcOffsetDeg, t.position.x, t.position.z, tr)) continue;
      const dist = Math.max(0, Math.hypot(t.position.x - a.x, t.position.z - a.z) - tr);
      const k = falloffDamage(1, dist, radius, c.edgeFalloff);
      this.hitTitan(t, attacker, c.titanDamage * k * mult, c.poiseDamage * k);
      titanHits++;
    }
    hits += titanHits;
    this.lastArea = { x: a.x, z: a.z, yaw: a.yaw, radius, arcDeg: c.arcDeg, arcOffsetDeg: c.arcOffsetDeg, age: 0 };

    if (byPlayer) {
      // Ground slams always shake; swings only shake properly when they connect.
      const connected = hits > 0 || a.move === 'stomp' || a.move === 'pulse';
      this.feedback.addTrauma(connected ? c.trauma : c.trauma * 0.3);
      this.feedback.addKick(c.kick);
      if (connected && c.hitPause > 0) this.feedback.hitPause(titanHits > 0 ? c.hitPause * 1.5 : c.hitPause);
    }
    if (a.move === 'stomp' || a.move === 'pulse') this.dust.burst(a.x, terrain.heightAt(a.x, a.z), a.z, DUST.collapse, DUST.maxBurstScale);
    this.events.emit('combat:impact', { move: a.move, x: a.x, z: a.z, yaw: a.yaw, radius, hits, isPlayer: byPlayer });
  }

  private roar(a: Extract<AttackEvent, { type: 'roar' }>, attacker: Titan, titans: readonly Titan[]): void {
    const r = attacker.combat.cfg.roar;
    if (attacker.isPlayer) {
      this.feedback.addTrauma(r.trauma);
      this.military?.roar(a.x, a.z, r.stunRadius);
    }
    if (r.stunRadius > 0) {
      for (const t of titans) {
        if (t === attacker) continue;
        if (Math.hypot(t.position.x - a.x, t.position.z - a.z) > r.stunRadius) continue;
        if (t.remote) {
          if (attacker.isPlayer) this.remoteHit?.(t, 0, 0, r.stunSeconds);
        } else t.combat.stun(r.stunSeconds);
      }
    }
    this.events.emit('titan:roar', { x: a.x, z: a.z, radius: r.stunRadius, stunSeconds: r.stunSeconds, isPlayer: attacker.isPlayer });
  }

  private beam(a: Extract<AttackEvent, { type: 'beam' }>, attacker: Titan, titans: readonly Titan[], dt: number): void {
    const b = attacker.combat.cfg.beam;
    const byPlayer = attacker.isPlayer;
    _ray.origin.x = a.ox;
    _ray.origin.y = a.oy;
    _ray.origin.z = a.oz;
    _ray.dir.x = a.dx;
    _ray.dir.y = a.dy;
    _ray.dir.z = a.dz;
    const hit = this.physics.world.castRay(_ray, b.range, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, attacker.body);
    let toi = hit ? hit.timeOfImpact : b.range;
    // Beyond the colliders (physics radius): the ground plane under the attacker.
    if (a.dy < 0) toi = Math.min(toi, (attacker.position.y - a.oy) / a.dy);
    const end = attacker.combat.beamEnd;
    end.x = a.ox + a.dx * toi;
    end.y = a.oy + a.dy * toi;
    end.z = a.oz + a.dz * toi;
    end.hit = toi < b.range;

    if (hit && hit.timeOfImpact <= toi) {
      const handle = hit.collider.handle;
      const target = titans.find((k) => k.collider.handle === handle);
      if (target) {
        this.hitTitan(target, attacker, a.damage * b.titanDamageFraction, a.damage * b.poiseFraction);
      } else {
        const s = this.chunks.structureForCollider(handle);
        if (s && s.state === 'intact') this.destruction.damage(s, a.damage, a.ox, a.oz, byPlayer);
      }
    }
    if (end.hit) {
      // Impact blast: crush small things, singe large ones near the impact.
      const blast = b.impactRadius;
      this.chunks.forEachNear(end.x, end.z, blast, (s) => {
        if (end.y > s.spec.y + s.spec.height + blast) return;
        if (s.spec.size !== 'large') this.destruction.crush(s, byPlayer);
        else this.destruction.damage(s, a.damage * b.impactDpsFraction, end.x, end.z, byPlayer);
      });
    }
    if (byPlayer) {
      this.feedback.addTrauma(b.traumaPerSecond * dt);
      this.military?.hitBeam(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, toi, end, b.impactRadius);
    }
  }
}
