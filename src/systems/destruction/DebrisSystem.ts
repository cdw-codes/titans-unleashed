import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { DESTRUCTION } from '../../config/destruction';
import type { PhysicsSystem } from '../PhysicsSystem';
import { PhysicsInstances } from '../PhysicsInstances';

const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export interface DebrisSpawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: number;
}

/**
 * Pooled physics debris under a hard global cap (quality preset). Pieces live
 * for a while, then shrink away and free their body. When full, the oldest
 * piece is recycled so new destruction always gets debris.
 */
export class DebrisSystem {
  readonly instances: PhysicsInstances;
  private readonly age: Float32Array;
  private cap: number;

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsSystem,
    cap: number,
    readonly maxCapacity = 400,
  ) {
    // Chunky irregular rock: a jittered icosahedron.
    const geo = new THREE.IcosahedronGeometry(0.6, 0);
    const pos = geo.attributes['position']!;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.75 + ((Math.sin(i * 91.7) + 1) / 2) * 0.5;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.8, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    this.instances = new PhysicsInstances(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), maxCapacity);
    this.age = new Float32Array(maxCapacity);
    this.cap = Math.min(cap, maxCapacity);
    scene.add(this.instances.mesh);
  }

  get count(): number {
    return this.instances.size;
  }

  setCap(cap: number): void {
    this.cap = Math.min(cap, this.maxCapacity);
    while (this.instances.size > this.cap) this.removeAt(this.oldest());
  }

  spawn(d: DebrisSpawn): void {
    if (this.cap <= 0) return;
    if (this.instances.size >= this.cap) this.removeAt(this.oldest());
    _q.setFromEuler(_e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    const body = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(d.x, d.y, d.z)
        .setRotation(_q)
        .setLinvel(d.vx, d.vy, d.vz)
        .setAngvel({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 })
        .setLinearDamping(0.05)
        .setAngularDamping(0.3),
    );
    const r = d.size * 0.5;
    this.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(r * 0.8, r * 0.6, r * 0.8).setDensity(1.5).setFriction(0.9).setRestitution(0.05),
      body,
    );
    const v = 0.85 + Math.random() * 0.3;
    const i = this.instances.add(body, _scale.setScalar(d.size), _color.setHex(d.color).multiplyScalar(v));
    this.age[i] = 0;
  }

  /** Fixed tick, after the physics step. */
  fixedUpdate(dt: number): void {
    const D = DESTRUCTION;
    let i = 0;
    while (i < this.instances.size) {
      this.age[i]! += dt;
      const a = this.age[i]!;
      if (a >= D.debrisLifetime + D.debrisFadeTime) {
        this.removeAt(i);
        continue;
      }
      this.instances.scaleMul[i] = a > D.debrisLifetime ? 1 - (a - D.debrisLifetime) / D.debrisFadeTime : 1;
      i++;
    }
    this.instances.snapshot();
  }

  render(alpha: number): void {
    this.instances.render(alpha);
  }

  private oldest(): number {
    let best = 0;
    for (let i = 1; i < this.instances.size; i++) if (this.age[i]! > this.age[best]!) best = i;
    return best;
  }

  private removeAt(i: number): void {
    this.physics.world.removeRigidBody(this.instances.bodyAt(i));
    const moved = this.instances.remove(i);
    if (moved >= 0) this.age[i] = this.age[moved]!;
  }
}
