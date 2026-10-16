import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * One InstancedMesh whose instances are driven by Rapier bodies, with
 * prev/current transform snapshots for render interpolation. Supports O(1)
 * swap-removal so it can back pooled debris. One draw call for every piece.
 */
export class PhysicsInstances {
  readonly mesh: THREE.InstancedMesh;
  private readonly bodies: (RAPIER.RigidBody | null)[];
  private readonly scales: Float32Array;
  /** Per-instance visual scale multiplier (fade-out shrink). */
  readonly scaleMul: Float32Array;
  private readonly prev: Float32Array; // x y z qx qy qz qw per instance
  private readonly curr: Float32Array;
  private count = 0;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, readonly capacity: number) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // instances span the world; bounds aren't tracked
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.bodies = new Array<RAPIER.RigidBody | null>(capacity).fill(null);
    this.scales = new Float32Array(capacity * 3);
    this.scaleMul = new Float32Array(capacity).fill(1);
    this.prev = new Float32Array(capacity * 7);
    this.curr = new Float32Array(capacity * 7);
  }

  get size(): number {
    return this.count;
  }

  bodyAt(i: number): RAPIER.RigidBody {
    return this.bodies[i]!;
  }

  /** Returns the instance index, or -1 when full. */
  add(body: RAPIER.RigidBody, scale: THREE.Vector3, color?: THREE.Color): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.bodies[i] = body;
    this.scales.set([scale.x, scale.y, scale.z], i * 3);
    this.scaleMul[i] = 1;
    this.read(i, this.curr);
    this.prev.set(this.curr.subarray(i * 7, i * 7 + 7), i * 7);
    this.mesh.setColorAt(i, color ?? _c.set(1, 1, 1));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.count;
    return i;
  }

  /**
   * Remove instance i by moving the last instance into its slot. Returns the
   * index that moved into i (or -1 if i was last) so callers can mirror the swap.
   * The caller owns removing the body from the physics world.
   */
  remove(i: number): number {
    const last = --this.count;
    this.mesh.count = this.count;
    if (i === last) {
      this.bodies[last] = null;
      return -1;
    }
    this.bodies[i] = this.bodies[last]!;
    this.bodies[last] = null;
    this.scales.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.scaleMul[i] = this.scaleMul[last]!;
    this.prev.copyWithin(i * 7, last * 7, last * 7 + 7);
    this.curr.copyWithin(i * 7, last * 7, last * 7 + 7);
    this.mesh.getColorAt(last, _c);
    this.mesh.setColorAt(i, _c);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return last;
  }

  /** Call once per fixed tick, after the physics step. */
  snapshot(): void {
    this.prev.set(this.curr.subarray(0, this.count * 7));
    for (let i = 0; i < this.count; i++) this.read(i, this.curr);
  }

  /** Call once per render frame. */
  render(alpha: number): void {
    const a = this.prev;
    const b = this.curr;
    for (let i = 0; i < this.count; i++) {
      const o = i * 7;
      _p.set(
        a[o]! + (b[o]! - a[o]!) * alpha,
        a[o + 1]! + (b[o + 1]! - a[o + 1]!) * alpha,
        a[o + 2]! + (b[o + 2]! - a[o + 2]!) * alpha,
      );
      _qa.set(a[o + 3]!, a[o + 4]!, a[o + 5]!, a[o + 6]!);
      _qb.set(b[o + 3]!, b[o + 4]!, b[o + 5]!, b[o + 6]!);
      _q.slerpQuaternions(_qa, _qb, alpha);
      const k = this.scaleMul[i]!;
      _s.set(this.scales[i * 3]! * k, this.scales[i * 3 + 1]! * k, this.scales[i * 3 + 2]! * k);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private read(i: number, out: Float32Array): void {
    const body = this.bodies[i];
    if (!body) return;
    const t = body.translation();
    const r = body.rotation();
    out.set([t.x, t.y, t.z, r.x, r.y, r.z, r.w], i * 7);
  }
}
