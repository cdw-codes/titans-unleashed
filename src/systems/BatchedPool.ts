import * as THREE from 'three';

/**
 * Several geometries (e.g. car variants) drawn in ONE draw call with
 * per-instance geometry choice, matrix and color (THREE.BatchedMesh, with
 * per-object frustum culling). Same surface as InstancePool, plus `variant`.
 */
export class BatchedPool {
  readonly mesh: THREE.BatchedMesh;
  private readonly geometryIds: number[];
  private capacity: number;
  private count = 0;
  /** Instance ground positions (x, z), for distance culling. */
  private readonly pos = new Map<number, { x: number; z: number }>();

  constructor(scene: THREE.Scene, geometries: THREE.BufferGeometry[], material: THREE.Material, capacity: number, castShadow = true) {
    const verts = geometries.reduce((n, g) => n + g.attributes['position']!.count, 0);
    const indices = geometries.reduce((n, g) => n + (g.index ? g.index.count : g.attributes['position']!.count), 0);
    this.capacity = capacity;
    this.mesh = new THREE.BatchedMesh(capacity, verts, indices, material);
    this.geometryIds = geometries.map((g) => this.mesh.addGeometry(g));
    // Whole-object bounds go stale as instances stream in; per-instance culling still runs.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  get variants(): number {
    return this.geometryIds.length;
  }

  get used(): number {
    return this.count;
  }

  add(matrix: THREE.Matrix4, color: THREE.Color, variant = 0): number {
    if (this.count >= this.capacity) {
      this.capacity *= 2;
      this.mesh.setInstanceCount(this.capacity);
    }
    const id = this.mesh.addInstance(this.geometryIds[variant % this.geometryIds.length]!);
    this.mesh.setMatrixAt(id, matrix);
    this.mesh.setColorAt(id, color);
    this.pos.set(id, { x: matrix.elements[12]!, z: matrix.elements[14]! });
    this.count++;
    return id;
  }

  remove(id: number): void {
    this.mesh.deleteInstance(id);
    this.pos.delete(id);
    this.count--;
  }

  setMatrix(id: number, m: THREE.Matrix4): void {
    this.mesh.setMatrixAt(id, m);
  }

  getMatrix(id: number, out: THREE.Matrix4): THREE.Matrix4 {
    return this.mesh.getMatrixAt(id, out);
  }

  setColor(id: number, c: THREE.Color): void {
    this.mesh.setColorAt(id, c);
  }

  getColor(id: number, out: THREE.Color): THREE.Color {
    return this.mesh.getColorAt(id, out);
  }

  /** Hide instances farther than `radius` from (x, z): small props vanish into the distance. */
  cullBeyond(x: number, z: number, radius: number): void {
    const r2 = radius * radius;
    for (const [id, p] of this.pos) {
      const dx = p.x - x;
      const dz = p.z - z;
      this.mesh.setVisibleAt(id, dx * dx + dz * dz <= r2);
    }
  }

  /** BatchedMesh uploads changes itself. */
  flush(): void {}
}
