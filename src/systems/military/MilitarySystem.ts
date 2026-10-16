import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MILITARY, type MilitaryConfig } from '../../config/military';
import { CITY } from '../../config/city';
import { DUST, FIRE, SMOKE } from '../../config/effects';
import type { DustBurstConfig } from '../../config/effects';
import { approachAngle, wrapAngle } from '../../core/math';
import type { Kaiju } from '../../entities/kaiju/Kaiju';
import type { ChunkManager } from '../../world/city/ChunkManager';
import type { PhysicsSystem } from '../PhysicsSystem';
import type { DestructionSystem } from '../destruction/DestructionSystem';
import type { DustSystem } from '../effects/DustSystem';
import { inArc } from '../combat/rules';
import {
  heliBodyGeometry, heliRotorGeometry, instanced, tankHullGeometry, tankTurretGeometry, tracerGeometry, unitMaterial,
} from './militaryMeshes';

export type UnitKind = 'tank' | 'heli';

interface Tank {
  x: number; z: number; px: number; pz: number;
  yaw: number; pyaw: number; turret: number; pturret: number;
  tx: number; tz: number; hasTarget: boolean; anchorX: number; anchorZ: number;
  reload: number; stun: number; leaving: boolean;
}

interface Heli {
  x: number; y: number; z: number; px: number; py: number; pz: number;
  yaw: number; pyaw: number; rotor: number;
  angle: number; dir: 1 | -1; radius: number; runTimer: number; bob: number;
  reload: number; volley: number; volleyTimer: number;
  falling: boolean; vx: number; vy: number; vz: number; spin: number;
  leaving: boolean;
}

interface Shot {
  kind: UnitKind;
  x: number; y: number; z: number; px: number; py: number; pz: number;
  vx: number; vy: number; vz: number; life: number;
}

export interface MilitaryCallbacks {
  /** A shot hit the player. */
  hitPlayer(damage: number, poiseDamage: number): void;
  /** The player destroyed a unit (score, energy, heat). */
  unitDestroyed(kind: UnitKind, x: number, z: number): void;
  /** Something blew up nearby (camera feedback, audio). */
  explosion(x: number, z: number, size: number): void;
  /** A unit fired (audio). */
  fired(kind: UnitKind, x: number, y: number, z: number): void;
}

const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

const MUZZLE: DustBurstConfig = { ...FIRE.beamImpact, count: 3, sizeStart: 3, sizeEnd: 9, lifeMin: 0.15, lifeMax: 0.3, speedMin: 2, speedMax: 6, riseMin: 0, riseMax: 2 };
const SMALL_BLAST: DustBurstConfig = { ...FIRE.beamImpact, count: 5, sizeStart: 5, sizeEnd: 18, lifeMin: 0.3, lifeMax: 0.6 };
const ROCKET_SMOKE: DustBurstConfig = { ...SMOKE.plume, count: 1, ringRadius: 0, riseMin: 0, riseMax: 1, speedMin: 0, speedMax: 1, sizeStart: 3, sizeEnd: 10, lifeMin: 0.8, lifeMax: 1.2, opacity: 0.45 };
const CRASH_SMOKE: DustBurstConfig = { ...ROCKET_SMOKE, sizeStart: 6, sizeEnd: 20, opacity: 0.6 };

/**
 * Military harassment: pooled tanks that drive the street grid and shell the
 * kaiju, helicopters that circle at head height and fire rockets, and their
 * shots. Kinematic (no physics bodies); shots raycast against buildings.
 * Escalates with the threat level; withdraws when suppressed (rival fights).
 */
export class MilitarySystem {
  private readonly tanks: Tank[] = [];
  private readonly helis: Heli[] = [];
  private readonly shots: Shot[] = [];
  private spawnTimer = 3;
  private readonly hull: THREE.InstancedMesh;
  private readonly turret: THREE.InstancedMesh;
  private readonly heliBody: THREE.InstancedMesh;
  private readonly heliRotor: THREE.InstancedMesh;
  private readonly tracers: THREE.InstancedMesh;
  private readonly pitch = CITY.blockSize + CITY.streetWidth;
  private smokeTimer = 0;

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsSystem,
    private readonly chunks: ChunkManager,
    private readonly destruction: DestructionSystem,
    private readonly fire: DustSystem,
    private readonly dust: DustSystem,
    private readonly smoke: DustSystem,
    private readonly cb: MilitaryCallbacks,
    private readonly cfg: MilitaryConfig = MILITARY,
    readonly tankCapacity = 24,
    readonly heliCapacity = 8,
    readonly shotCapacity = 96,
  ) {
    const mat = unitMaterial();
    this.hull = instanced(tankHullGeometry(), mat, tankCapacity);
    this.turret = instanced(tankTurretGeometry(), mat, tankCapacity);
    this.heliBody = instanced(heliBodyGeometry(), mat, heliCapacity);
    this.heliRotor = instanced(heliRotorGeometry(), mat, heliCapacity, false);
    this.tracers = instanced(tracerGeometry(), new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: true }), shotCapacity, false);
    scene.add(this.hull, this.turret, this.heliBody, this.heliRotor, this.tracers);
  }

  get tankCount(): number {
    return this.tanks.length;
  }

  get heliCount(): number {
    return this.helis.filter((h) => !h.falling).length;
  }

  // ------------------------------------------------------------ sim

  fixedUpdate(dt: number, player: Kaiju, level: number, suppressed: boolean): void {
    const L = this.cfg.levels;
    const li = Math.max(0, Math.min(4, level - 1));
    const accuracy = L.accuracy[li]!;
    const withdraw = suppressed || level === 0 || player.state === 'defeated';

    if (!withdraw) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = L.spawnInterval[li]!;
        const wantTanks = L.maxTanks[li]!;
        const wantHelis = L.maxHelis[li]!;
        if (this.heliCount < wantHelis && this.helis.length < this.heliCapacity) this.spawnHeli(player);
        else if (this.tanks.length < wantTanks && this.tanks.length < this.tankCapacity) this.spawnTank(player);
      }
    }

    for (let i = this.tanks.length - 1; i >= 0; i--) {
      const t = this.tanks[i]!;
      t.leaving ||= withdraw;
      if (this.updateTank(t, dt, player, accuracy)) this.tanks.splice(i, 1);
    }
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i]!;
      if (!h.falling) h.leaving ||= withdraw;
      if (this.updateHeli(h, dt, player, accuracy)) this.helis.splice(i, 1);
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      if (this.updateShot(this.shots[i]!, dt, player)) this.shots.splice(i, 1);
    }
  }

  private spawnTank(player: Kaiju): void {
    const c = this.cfg.tank;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = c.spawnMin + Math.random() * (c.spawnMax - c.spawnMin);
      const x = Math.round((player.position.x + Math.sin(a) * d) / this.pitch) * this.pitch;
      const z = Math.round((player.position.z + Math.cos(a) * d) / this.pitch) * this.pitch;
      if (x > CITY.coastX - 100) continue;
      const yaw = Math.atan2(player.position.x - x, player.position.z - z);
      this.tanks.push({
        x, z, px: x, pz: z, yaw, pyaw: yaw, turret: yaw, pturret: yaw,
        tx: x, tz: z, hasTarget: false, anchorX: 0, anchorZ: 0,
        reload: c.reload * (0.5 + Math.random()), stun: 0, leaving: false,
      });
      return;
    }
  }

  private spawnHeli(player: Kaiju): void {
    const c = this.cfg.heli;
    const a = Math.random() * Math.PI * 2;
    const x = player.position.x + Math.sin(a) * c.spawnDistance;
    const z = player.position.z + Math.cos(a) * c.spawnDistance;
    this.helis.push({
      x, y: c.altitudeMax, z, px: x, py: c.altitudeMax, pz: z, yaw: a + Math.PI, pyaw: a + Math.PI, rotor: 0,
      angle: a, dir: Math.random() < 0.5 ? 1 : -1, radius: c.orbitRadius, runTimer: 6 + Math.random() * 4, bob: Math.random() * 10,
      reload: c.reload, volley: 0, volleyTimer: 0,
      falling: false, vx: 0, vy: 0, vz: 0, spin: 0, leaving: false,
    });
  }

  /** Returns true when the tank should be removed. */
  private updateTank(t: Tank, dt: number, player: Kaiju, accuracy: number): boolean {
    const c = this.cfg.tank;
    t.px = t.x;
    t.pz = t.z;
    t.pyaw = t.yaw;
    t.pturret = t.turret;
    const p = player.position;
    const dist = Math.hypot(p.x - t.x, p.z - t.z);
    if (dist > this.cfg.despawnDistance) return true;

    if (t.leaving) {
      // Drive straight away and vanish once far enough.
      const away = Math.atan2(t.x - p.x, t.z - p.z);
      t.yaw = approachAngle(t.yaw, away, 2 * dt);
      t.x += Math.sin(t.yaw) * c.speed * dt;
      t.z += Math.cos(t.yaw) * c.speed * dt;
      return dist > c.spawnMax + 150;
    }

    // Pick a stop on the street grid at preferred range; re-plan when the kaiju moves on.
    if (!t.hasTarget || Math.hypot(p.x - t.anchorX, p.z - t.anchorZ) > 200) {
      const ang = Math.atan2(t.x - p.x, t.z - p.z);
      t.tx = Math.round((p.x + Math.sin(ang) * c.preferredRange) / this.pitch) * this.pitch;
      t.tz = Math.round((p.z + Math.cos(ang) * c.preferredRange) / this.pitch) * this.pitch;
      t.anchorX = p.x;
      t.anchorZ = p.z;
      t.hasTarget = true;
    }
    // Manhattan driving: finish the x leg, then the z leg (streets only).
    const dx = t.tx - t.x;
    const dz = t.tz - t.z;
    let mx = 0;
    let mz = 0;
    if (Math.abs(dx) > 1) mx = Math.sign(dx);
    else if (Math.abs(dz) > 1) mz = Math.sign(dz);
    if (mx || mz) {
      const want = Math.atan2(mx, mz);
      t.yaw = approachAngle(t.yaw, want, 2.5 * dt);
      if (Math.abs(wrapAngle(want - t.yaw)) < 0.3) {
        const step = Math.min(c.speed * dt, Math.abs(mx ? dx : dz));
        t.x += mx * step;
        t.z += mz * step;
        // Parked cars in the way get flattened.
        this.chunks.forEachNear(t.x, t.z, c.length * 0.4, (st) => {
          if (st.spec.kind === 'car') this.destruction.crush(st, false);
        });
      }
    }

    // Turret tracks the kaiju; fire when aligned and in range.
    t.turret = approachAngle(t.turret, Math.atan2(p.x - t.x, p.z - t.z), c.turretTurnRate * dt);
    if (t.stun > 0) {
      t.stun -= dt;
      return false;
    }
    t.reload -= dt;
    if (t.reload <= 0 && dist < c.fireRange && Math.abs(wrapAngle(Math.atan2(p.x - t.x, p.z - t.z) - t.turret)) < 0.1) {
      t.reload = c.reload * (0.8 + Math.random() * 0.4);
      const len = c.length;
      const mx2 = t.x + Math.sin(t.turret) * len * 0.75;
      const mz2 = t.z + Math.cos(t.turret) * len * 0.75;
      this.fireAt('tank', mx2, len * 0.34, mz2, player, accuracy, c.spread, c.shellSpeed);
      this.cb.fired('tank', mx2, len * 0.34, mz2);
      this.fire.burst(mx2, len * 0.34, mz2, MUZZLE, 1);
      this.dust.burst(t.x, 0, t.z, DUST.crush, 0.5);
    }
    return false;
  }

  /** Returns true when the helicopter should be removed. */
  private updateHeli(h: Heli, dt: number, player: Kaiju, accuracy: number): boolean {
    const c = this.cfg.heli;
    h.px = h.x;
    h.py = h.y;
    h.pz = h.z;
    h.pyaw = h.yaw;
    h.rotor += dt * 40;
    const p = player.position;

    if (h.falling) {
      h.vy -= 30 * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.z += h.vz * dt;
      h.yaw += h.spin * dt;
      if (Math.random() < dt * 20) this.smoke.burst(h.x, h.y, h.z, CRASH_SMOKE, 1);
      if (h.y <= 0) {
        this.blast(h.x, 0, h.z, c.crashBlastRadius, c.missStructureDamage * 2, true);
        return true;
      }
      return false;
    }

    const dist = Math.hypot(p.x - h.x, p.z - h.z);
    if (h.leaving) {
      const away = Math.atan2(h.x - p.x, h.z - p.z);
      h.yaw = approachAngle(h.yaw, away, 1.5 * dt);
      h.x += Math.sin(h.yaw) * c.speed * dt;
      h.z += Math.cos(h.yaw) * c.speed * dt;
      h.y += 15 * dt;
      return dist > this.cfg.despawnDistance;
    }

    // Orbit with periodic attack runs that swoop in close.
    h.runTimer -= dt;
    if (h.runTimer <= -4) h.runTimer = 6 + Math.random() * 6;
    const radius = h.runTimer < 0 ? c.attackRadius : c.orbitRadius;
    h.radius += (radius - h.radius) * Math.min(1, dt * 0.6);
    h.angle += (c.speed / Math.max(60, h.radius)) * h.dir * dt * 0.5;
    h.bob += dt;
    const tx = p.x + Math.sin(h.angle) * h.radius;
    const tz = p.z + Math.cos(h.angle) * h.radius;
    const ty = c.altitudeMin + (c.altitudeMax - c.altitudeMin) * (0.5 + 0.5 * Math.sin(h.bob * 0.4));
    const k = Math.min(1, dt * 0.8);
    h.x += Math.max(-c.speed * dt, Math.min(c.speed * dt, (tx - h.x) * k));
    h.z += Math.max(-c.speed * dt, Math.min(c.speed * dt, (tz - h.z) * k));
    h.y += (ty - h.y) * Math.min(1, dt);
    h.yaw = approachAngle(h.yaw, Math.atan2(p.x - h.x, p.z - h.z), 1.5 * dt);

    h.reload -= dt;
    if (h.reload <= 0 && dist < c.fireRange) {
      h.reload = c.reload * (0.8 + Math.random() * 0.4);
      h.volley = c.rocketsPerVolley;
      h.volleyTimer = 0;
    }
    if (h.volley > 0) {
      h.volleyTimer -= dt;
      if (h.volleyTimer <= 0) {
        h.volley--;
        h.volleyTimer = c.rocketInterval;
        const side = h.volley % 2 ? 2 : -2;
        const ox = h.x + Math.cos(h.yaw) * side;
        const oz = h.z - Math.sin(h.yaw) * side;
        this.fireAt('heli', ox, h.y, oz, player, accuracy, c.spread, c.rocketSpeed);
        this.cb.fired('heli', ox, h.y, oz);
        this.fire.burst(ox, h.y, oz, MUZZLE, 0.8);
      }
    }
    return false;
  }

  private fireAt(kind: UnitKind, x: number, y: number, z: number, player: Kaiju, accuracy: number, spread: number, speed: number): void {
    if (this.shots.length >= this.shotCapacity) return;
    const p = player.position;
    const err = spread * (1 - accuracy);
    const tx = p.x + (Math.random() - 0.5) * 2 * err;
    const ty = p.y + player.spec.body.height * (0.35 + Math.random() * 0.4) + (Math.random() - 0.5) * err;
    const tz = p.z + (Math.random() - 0.5) * 2 * err;
    _d.set(tx - x, ty - y, tz - z).normalize().multiplyScalar(speed);
    this.shots.push({ kind, x, y, z, px: x, py: y, pz: z, vx: _d.x, vy: _d.y, vz: _d.z, life: 0 });
  }

  /** Returns true when the shot is done. */
  private updateShot(s: Shot, dt: number, player: Kaiju): boolean {
    s.px = s.x;
    s.py = s.y;
    s.pz = s.z;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.life += dt;
    if (s.kind === 'heli' && Math.random() < dt * 30) this.smoke.burst(s.x, s.y, s.z, ROCKET_SMOKE, 1);

    const b = player.spec.body;
    const p = player.position;
    if (player.state !== 'defeated' && Math.hypot(s.x - p.x, s.z - p.z) < b.capsuleRadius + 3 && s.y > p.y && s.y < p.y + b.height) {
      const c = s.kind === 'tank' ? this.cfg.tank : this.cfg.heli;
      this.cb.hitPlayer(c.damage, c.poiseDamage);
      this.fire.burst(s.x, s.y, s.z, SMALL_BLAST, s.kind === 'tank' ? 0.6 : 0.9);
      return true;
    }
    // Missed: blow up on whatever it hits.
    const step = Math.hypot(s.vx, s.vy, s.vz) * dt;
    _ray.origin.x = s.px;
    _ray.origin.y = s.py;
    _ray.origin.z = s.pz;
    _ray.dir.x = s.vx / (step / dt);
    _ray.dir.y = s.vy / (step / dt);
    _ray.dir.z = s.vz / (step / dt);
    const hit = this.physics.world.castRay(_ray, step, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, player.body);
    const missDamage = s.kind === 'tank' ? this.cfg.tank.missStructureDamage : this.cfg.heli.missStructureDamage;
    if (hit && this.chunks.structureForCollider(hit.collider.handle)) {
      const t = hit.timeOfImpact;
      this.blast(s.px + _ray.dir.x * t, s.py + _ray.dir.y * t, s.pz + _ray.dir.z * t, 8, missDamage, false);
      return true;
    }
    if (s.y <= 0) {
      this.blast(s.x, 0, s.z, 8, missDamage, false);
      return true;
    }
    return s.life > 5;
  }

  /** Explosion: fire, dust, crush props, damage buildings (not player-attributed). */
  private blast(x: number, y: number, z: number, radius: number, damage: number, big: boolean): void {
    this.fire.burst(x, y, z, SMALL_BLAST, big ? 1.6 : 0.7);
    this.dust.burst(x, 0, z, DUST.crush, big ? 2 : 0.8);
    this.chunks.forEachNear(x, z, radius, (st) => {
      if (y > st.spec.height + radius) return;
      if (st.spec.size !== 'large') this.destruction.crush(st, false);
      else this.destruction.damage(st, damage, x, z, false);
    });
    this.cb.explosion(x, z, big ? 1 : 0.3);
  }

  // ------------------------------------------------------------ player attacks

  /** Feet and body: tanks under the kaiju are crushed. */
  crushAt(x: number, z: number, radius: number): void {
    for (let i = this.tanks.length - 1; i >= 0; i--) {
      const t = this.tanks[i]!;
      if (Math.hypot(t.x - x, t.z - z) <= radius + this.cfg.tank.length * 0.4) this.destroyTank(i);
    }
  }

  /** Melee arc. Helicopters only get swatted if they fly within reach height. */
  hitArc(x: number, z: number, yaw: number, radius: number, arcDeg: number, arcOffsetDeg: number, reachHeight: number): number {
    let hits = 0;
    for (let i = this.tanks.length - 1; i >= 0; i--) {
      const t = this.tanks[i]!;
      if (inArc(x, z, yaw, radius, arcDeg, arcOffsetDeg, t.x, t.z, this.cfg.tank.length * 0.5)) {
        this.destroyTank(i);
        hits++;
      }
    }
    for (const h of this.helis) {
      if (h.falling || h.y > reachHeight) continue;
      if (inArc(x, z, yaw, radius + 20, arcDeg, arcOffsetDeg, h.x, h.z, this.cfg.heli.hitRadius)) {
        this.downHeli(h, Math.atan2(h.x - x, h.z - z), true);
        hits++;
      }
    }
    return hits;
  }

  /** Beam segment (origin, unit dir, length) plus its impact point. */
  hitBeam(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, length: number, end: { x: number; y: number; z: number; hit: boolean }, impactRadius: number): void {
    const near = (x: number, y: number, z: number, r: number) => {
      const t = Math.max(0, Math.min(length, (x - ox) * dx + (y - oy) * dy + (z - oz) * dz));
      return Math.hypot(ox + dx * t - x, oy + dy * t - y, oz + dz * t - z) <= r;
    };
    for (let i = this.tanks.length - 1; i >= 0; i--) {
      const t = this.tanks[i]!;
      const blasted = end.hit && Math.hypot(t.x - end.x, t.z - end.z) < impactRadius + 6 && end.y < 30;
      if (blasted || near(t.x, 3, t.z, 8)) this.destroyTank(i);
    }
    for (const h of this.helis) {
      if (!h.falling && near(h.x, h.y, h.z, this.cfg.heli.hitRadius + 6)) this.downHeli(h, Math.atan2(dx, dz), true);
    }
  }

  /** Roar: tanks stop firing; helicopters spin out and crash. */
  roar(x: number, z: number, radius: number): void {
    for (const t of this.tanks) if (Math.hypot(t.x - x, t.z - z) < radius) t.stun = this.cfg.roarTankStun;
    for (const h of this.helis) {
      if (!h.falling && Math.hypot(h.x - x, h.z - z) < radius) this.downHeli(h, Math.atan2(h.x - x, h.z - z), true);
    }
  }

  /** Any explosion (projectile blast, beam impact) destroys tanks caught in it. */
  blastUnits(x: number, z: number, radius: number, byPlayer: boolean): void {
    for (let i = this.tanks.length - 1; i >= 0; i--) {
      const t = this.tanks[i]!;
      if (Math.hypot(t.x - x, t.z - z) < radius) this.destroyTank(i, byPlayer);
    }
  }

  private destroyTank(i: number, byPlayer = true): void {
    const t = this.tanks[i]!;
    this.tanks.splice(i, 1);
    this.fire.burst(t.x, 3, t.z, SMALL_BLAST, 1);
    this.smoke.burst(t.x, 3, t.z, CRASH_SMOKE, 1.5);
    this.dust.burst(t.x, 0, t.z, DUST.crush, 1);
    if (byPlayer) this.cb.unitDestroyed('tank', t.x, t.z);
  }

  private downHeli(h: Heli, awayYaw: number, byPlayer: boolean): void {
    h.falling = true;
    h.vx = Math.sin(awayYaw) * 25;
    h.vz = Math.cos(awayYaw) * 25;
    h.vy = 10;
    h.spin = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3);
    this.fire.burst(h.x, h.y, h.z, SMALL_BLAST, 1.2);
    if (byPlayer) this.cb.unitDestroyed('heli', h.x, h.z);
  }

  // ------------------------------------------------------------ render

  render(alpha: number, dt: number): void {
    const tl = this.cfg.tank.length;
    _s.setScalar(tl);
    this.tanks.forEach((t, i) => {
      _p.set(t.px + (t.x - t.px) * alpha, 0, t.pz + (t.z - t.pz) * alpha);
      _q.setFromAxisAngle(UP, t.pyaw + wrapAngle(t.yaw - t.pyaw) * alpha);
      this.hull.setMatrixAt(i, _m.compose(_p, _q, _s));
      _q.setFromAxisAngle(UP, t.pturret + wrapAngle(t.turret - t.pturret) * alpha);
      this.turret.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    this.hull.count = this.turret.count = this.tanks.length;

    const hs = 16; // helicopter length (m)
    this.smokeTimer -= dt;
    this.helis.forEach((h, i) => {
      _p.set(h.px + (h.x - h.px) * alpha, h.py + (h.y - h.py) * alpha, h.pz + (h.z - h.pz) * alpha);
      const yaw = h.pyaw + wrapAngle(h.yaw - h.pyaw) * alpha;
      // Nose down when moving, banked when spinning out.
      _q.setFromEuler(_e.set(h.falling ? 0.5 : 0.15, yaw, h.falling ? 0.6 : 0, 'YXZ'));
      this.heliBody.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(hs)));
      _p.y += hs * 0.48;
      _q.setFromAxisAngle(UP, h.rotor);
      this.heliRotor.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(hs)));
    });
    this.heliBody.count = this.heliRotor.count = this.helis.length;

    this.shots.forEach((s, i) => {
      _p.set(s.px + (s.x - s.px) * alpha, s.py + (s.y - s.py) * alpha, s.pz + (s.z - s.pz) * alpha);
      _d.set(s.vx, s.vy, s.vz).normalize();
      _q.setFromUnitVectors(FWD, _d);
      const big = s.kind === 'heli';
      _s.set(big ? 1.2 : 0.8, big ? 1.2 : 0.8, big ? 7 : 12);
      this.tracers.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    this.tracers.count = this.shots.length;

    for (const m of [this.hull, this.turret, this.heliBody, this.heliRotor, this.tracers]) m.instanceMatrix.needsUpdate = true;
  }

  /** Flying helicopters (for rotor audio). */
  heliPositions(out: { x: number; y: number; z: number }[]): number {
    let n = 0;
    for (const h of this.helis) {
      if (h.falling) continue;
      const o = out[n] ?? (out[n] = { x: 0, y: 0, z: 0 });
      o.x = h.x;
      o.y = h.y;
      o.z = h.z;
      n++;
    }
    return n;
  }

  /** Debug: drop everything. */
  clear(): void {
    this.tanks.length = 0;
    this.helis.length = 0;
    this.shots.length = 0;
  }
}
