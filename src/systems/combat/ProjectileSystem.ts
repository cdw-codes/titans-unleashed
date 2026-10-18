import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { MoveConfig, ProjectileConfig } from '../../config/combat';
import { FIRE, PLASMA_TRAIL } from '../../config/effects';
import type { Titan } from '../../entities/titan/Titan';
import type { ChunkManager } from '../../world/city/ChunkManager';
import type { PhysicsSystem } from '../PhysicsSystem';
import type { DestructionSystem } from '../destruction/DestructionSystem';
import type { DustSystem } from '../effects/DustSystem';
import { terrain } from '../../world/terrain/Terrain';

interface Projectile {
  owner: Titan;
  cfg: ProjectileConfig;
  prev: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
}

export interface ProjectileHit {
  target: Titan;
  owner: Titan;
  damage: number;
  poiseDamage: number;
  x: number;
  z: number;
}

const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Pooled ballistic projectiles (plasma orbs). Fixed tick: integrate with a
 * little gravity, hit titan bodies directly, explode on structures or the
 * ground with a blast that crushes and damages. One draw call for all orbs.
 */
export class ProjectileSystem {
  private readonly live: Projectile[] = [];
  private readonly pool: Projectile[] = [];
  private readonly mesh: THREE.InstancedMesh;
  private trailTimer = 0;
  /** Explosions this tick: (x, y, z, radius, owner is player). Read by Game for camera feedback. */
  readonly explosions: { x: number; y: number; z: number; radius: number; byPlayer: boolean }[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsSystem,
    private readonly chunks: ChunkManager,
    private readonly destruction: DestructionSystem,
    private readonly fire: DustSystem,
    private readonly trail: DustSystem,
    private readonly onTitanHit: (hit: ProjectileHit) => void,
    readonly capacity = 64,
  ) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      // HDR white tinted per instance: bright enough to bloom.
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), fog: false }),
      capacity,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    scene.add(this.mesh);
  }

  get count(): number {
    return this.live.length;
  }

  spawn(owner: Titan, move: MoveConfig, ox: number, oy: number, oz: number, tx: number, ty: number, tz: number): void {
    const cfg = move.projectile;
    if (!cfg || this.live.length >= this.capacity) return;
    const p = this.pool.pop() ?? { owner, cfg, prev: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0 };
    p.owner = owner;
    p.cfg = cfg;
    p.age = 0;
    p.pos.set(ox, oy, oz);
    p.prev.copy(p.pos);
    // Aim with spread, then add lift so gravity brings it onto the target.
    const dx = tx - ox;
    const dy = ty - oy;
    const dz = tz - oz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const spread = (cfg.spreadDeg * Math.PI) / 180;
    p.vel.set(dx / dist, dy / dist, dz / dist);
    p.vel.applyAxisAngle(THREE.Object3D.DEFAULT_UP, (Math.random() - 0.5) * spread * 2);
    p.vel.y += (Math.random() - 0.5) * spread;
    p.vel.normalize().multiplyScalar(cfg.speed);
    const flight = dist / cfg.speed;
    p.vel.y += 0.5 * cfg.gravity * flight;
    this.live.push(p);
  }

  fixedUpdate(dt: number, titans: readonly Titan[]): void {
    this.explosions.length = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.age += dt;
      p.prev.copy(p.pos);
      p.vel.y -= p.cfg.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);

      let explodeAt: THREE.Vector3 | null = null;
      let direct: Titan | null = null;

      for (const k of titans) {
        if (k === p.owner || k.state === 'defeated') continue;
        const r = k.spec.body.capsuleRadius + p.cfg.size;
        const top = k.position.y + (k.spec.body.capsuleHalfHeight + k.spec.body.capsuleRadius) * 2;
        if (Math.hypot(p.pos.x - k.position.x, p.pos.z - k.position.z) < r && p.pos.y > k.position.y && p.pos.y < top) {
          direct = k;
          explodeAt = p.pos;
          break;
        }
      }
      if (!explodeAt) {
        const step = p.vel.length() * dt;
        _ray.origin.x = p.prev.x;
        _ray.origin.y = p.prev.y;
        _ray.origin.z = p.prev.z;
        _ray.dir.x = p.vel.x / p.vel.length();
        _ray.dir.y = p.vel.y / p.vel.length();
        _ray.dir.z = p.vel.z / p.vel.length();
        const hit = this.physics.world.castRay(_ray, step, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, p.owner.body);
        if (hit && this.chunks.structureForCollider(hit.collider.handle)) {
          explodeAt = p.pos.copy(p.prev).addScaledVector(p.vel, hit.timeOfImpact / p.vel.length());
        } else if (p.pos.y <= terrain.heightAt(p.pos.x, p.pos.z)) {
          p.pos.y = terrain.heightAt(p.pos.x, p.pos.z);
          explodeAt = p.pos;
        } else if (p.age > p.cfg.lifetime) {
          explodeAt = p.pos;
        }
      }
      if (explodeAt) {
        this.explode(p, explodeAt, direct, titans);
        this.live.splice(i, 1);
        this.pool.push(p);
      }
    }
  }

  /** Render-rate: interpolated orb positions and glowing trails. */
  render(alpha: number, dt: number): void {
    this.trailTimer -= dt;
    const emit = this.trailTimer <= 0;
    if (emit) this.trailTimer = 0.03;
    this.live.forEach((p, i) => {
      _p.lerpVectors(p.prev, p.pos, alpha);
      const pulse = 1 + 0.15 * Math.sin((p.age + i) * 40);
      _s.setScalar(p.cfg.size * pulse);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      this.mesh.setColorAt(i, _c.setHex(p.cfg.color));
      if (emit) this.trail.burst(_p.x, _p.y, _p.z, PLASMA_TRAIL.puff, p.cfg.size / 6);
    });
    this.mesh.count = this.live.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private explode(p: Projectile, at: THREE.Vector3, direct: Titan | null, titans: readonly Titan[]): void {
    const c = p.cfg;
    const byPlayer = p.owner.isPlayer;
    const { x, y, z } = at;
    if (direct) this.onTitanHit({ target: direct, owner: p.owner, damage: c.damage, poiseDamage: c.poiseDamage, x, z });
    // Splash: half damage to other titan caught in the blast.
    for (const k of titans) {
      if (k === p.owner || k === direct || k.state === 'defeated') continue;
      if (Math.hypot(k.position.x - x, k.position.z - z) < c.blastRadius + k.spec.body.capsuleRadius && y < k.position.y + k.spec.body.height) {
        this.onTitanHit({ target: k, owner: p.owner, damage: c.damage * 0.5, poiseDamage: c.poiseDamage * 0.5, x, z });
      }
    }
    this.chunks.forEachNear(x, z, c.blastRadius, (s) => {
      if (y > s.spec.y + s.spec.height + c.blastRadius) return;
      if (s.spec.size !== 'large') this.destruction.crush(s, byPlayer);
      else this.destruction.damage(s, c.structureDamage, x, z, byPlayer);
    });
    this.fire.burst(x, y, z, FIRE.beamImpact, c.blastRadius / 15);
    this.explosions.push({ x, y, z, radius: c.blastRadius, byPlayer });
  }
}
