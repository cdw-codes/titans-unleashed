import * as THREE from 'three';
import { SlotAllocator } from '../core/SlotAllocator';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export interface InstancePoolOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * A global InstancedMesh shared by every loaded chunk: one draw call per pool
 * regardless of chunk count. Slots are allocated/freed as chunks stream; the
 * pool doubles its capacity when full. Uploads once per frame when dirty.
 */
export class InstancePool {
  mesh: THREE.InstancedMesh;
  private readonly slots = new SlotAllocator();
  private dirtyMatrix = false;
  private dirtyColor = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    capacity: number,
    private readonly opts: InstancePoolOptions = {},
  ) {
    this.mesh = this.createMesh(capacity);
    scene.add(this.mesh);
  }

  get used(): number {
    return this.slots.used;
  }

  get capacity(): number {
    return this.mesh.instanceMatrix.count;
  }

  add(matrix: THREE.Matrix4, color: THREE.Color): number {
    const slot = this.slots.alloc();
    if (slot >= this.capacity) this.grow();
    this.setMatrix(slot, matrix);
    this.setColor(slot, color);
    return slot;
  }

  remove(slot: number): void {
    this.mesh.setMatrixAt(slot, ZERO);
    this.slots.free(slot);
    this.dirtyMatrix = true;
  }

  setMatrix(slot: number, matrix: THREE.Matrix4): void {
    this.mesh.setMatrixAt(slot, matrix);
    this.dirtyMatrix = true;
  }

  getMatrix(slot: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.mesh.getMatrixAt(slot, out);
    return out;
  }

  setColor(slot: number, color: THREE.Color): void {
    this.mesh.setColorAt(slot, color);
    this.dirtyColor = true;
  }

  getColor(slot: number, out: THREE.Color): THREE.Color {
    this.mesh.getColorAt(slot, out);
    return out;
  }

  /** Call once per frame before rendering. */
  flush(): void {
    this.mesh.count = this.slots.highWater;
    if (this.dirtyMatrix) this.mesh.instanceMatrix.needsUpdate = true;
    if (this.dirtyColor && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirtyMatrix = this.dirtyColor = false;
  }

  private createMesh(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = this.opts.castShadow ?? true;
    mesh.receiveShadow = this.opts.receiveShadow ?? true;
    mesh.frustumCulled = false; // spans every loaded chunk
    mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // force instanceColor allocation
    return mesh;
  }

  private grow(): void {
    const old = this.mesh;
    const next = this.createMesh(old.instanceMatrix.count * 2);
    (next.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    if (old.instanceColor && next.instanceColor) {
      (next.instanceColor.array as Float32Array).set(old.instanceColor.array as Float32Array);
    }
    next.count = old.count;
    this.scene.remove(old);
    old.dispose();
    this.scene.add(next);
    this.mesh = next;
    this.dirtyMatrix = this.dirtyColor = true;
    if (import.meta.env.DEV) console.info(`[InstancePool] grew to ${next.instanceMatrix.count}`);
  }
}
