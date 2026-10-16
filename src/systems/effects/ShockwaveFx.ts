import * as THREE from 'three';

interface Ring {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  t: number;
  duration: number;
  radius: number;
  opacity: number;
}

/** Expanding ground rings for stomps and roars. Small fixed pool; one draw call per live ring. */
export class ShockwaveFx {
  private readonly rings: Ring[] = [];

  constructor(scene: THREE.Scene, size = 6) {
    const geo = new THREE.RingGeometry(0.82, 1, 64).rotateX(-Math.PI / 2);
    for (let i = 0; i < size; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.visible = false;
      mesh.renderOrder = 5;
      scene.add(mesh);
      this.rings.push({ mesh, t: 0, duration: 1, radius: 1, opacity: 0 });
    }
  }

  spawn(x: number, y: number, z: number, radius: number, duration: number, color: number, opacity: number): void {
    const ring = this.rings.find((r) => !r.mesh.visible) ?? this.rings.reduce((a, b) => (a.t / a.duration > b.t / b.duration ? a : b));
    ring.t = 0;
    ring.duration = duration;
    ring.radius = radius;
    ring.opacity = opacity;
    ring.mesh.position.set(x, y, z);
    ring.mesh.material.color.setHex(color);
    ring.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const p = r.t / r.duration;
      if (p >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - p) ** 3;
      r.mesh.scale.setScalar(Math.max(0.01, r.radius * e));
      r.mesh.material.opacity = r.opacity * (1 - p);
    }
  }
}
