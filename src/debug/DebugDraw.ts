import * as THREE from 'three';

/**
 * Immediate-mode debug lines (hitboxes, ranges, AI targets). Call the draw
 * methods every frame while debug is on; the buffer is cleared after render.
 */
export class DebugDraw {
  readonly lines: THREE.LineSegments;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private count = 0;
  private readonly c = new THREE.Color();

  constructor(private readonly maxSegments = 20000) {
    this.positions = new Float32Array(maxSegments * 6);
    this.colors = new Float32Array(maxSegments * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, fog: false, transparent: true }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
  }

  line(a: THREE.Vector3Like, b: THREE.Vector3Like, color: THREE.ColorRepresentation): void {
    if (this.count >= this.maxSegments) return;
    this.c.set(color);
    const o = this.count++ * 6;
    this.positions.set([a.x, a.y, a.z, b.x, b.y, b.z], o);
    this.colors.set([this.c.r, this.c.g, this.c.b, this.c.r, this.c.g, this.c.b], o);
  }

  /** Axis-aligned box from center + half extents. */
  box(center: THREE.Vector3Like, half: THREE.Vector3Like, color: THREE.ColorRepresentation): void {
    const { x, y, z } = center;
    const corners = [-1, 1].flatMap((sx) =>
      [-1, 1].flatMap((sy) => [-1, 1].map((sz) => ({ x: x + sx * half.x, y: y + sy * half.y, z: z + sz * half.z }))),
    );
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [i, j] of edges) this.line(corners[i!]!, corners[j!]!, color);
  }

  /** Three axis-aligned circles. */
  sphere(center: THREE.Vector3Like, r: number, color: THREE.ColorRepresentation, segments = 24): void {
    for (let axis = 0; axis < 3; axis++) {
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const p = (a: number) => {
          const u = Math.cos(a) * r;
          const v = Math.sin(a) * r;
          return axis === 0
            ? { x: center.x, y: center.y + u, z: center.z + v }
            : axis === 1
              ? { x: center.x + u, y: center.y, z: center.z + v }
              : { x: center.x + u, y: center.y + v, z: center.z };
        };
        this.line(p(a0), p(a1), color);
      }
    }
  }

  /** Upload this frame's lines. Call right before rendering. */
  flush(): void {
    const g = this.lines.geometry;
    g.setDrawRange(0, this.count * 2);
    (g.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes['color'] as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
  }
}
