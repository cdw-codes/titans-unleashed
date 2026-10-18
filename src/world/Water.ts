import * as THREE from 'three';
import { ENVIRONMENT as ENV } from '../config/environment';
import { terrain } from './terrain/Terrain';

/**
 * One water plane at the terrain's water level, following the player: the
 * terrain hides it except where the ground dips below (sea, lakes). A tiling
 * ripple normal map drifts slowly for a calm, stylized surface.
 */
export class Water {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhongMaterial>;
  private readonly normals: THREE.CanvasTexture;
  private time = 0;

  constructor(scene: THREE.Scene, drawDistance: number) {
    const size = drawDistance * 2.4;
    this.normals = rippleNormals();
    this.normals.repeat.set(size / 90, size / 90);
    const geo = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshPhongMaterial({
        color: ENV.waterColor,
        specular: 0x9fb4c8,
        shininess: 60,
        normalMap: this.normals,
        normalScale: new THREE.Vector2(0.35, 0.35),
      }),
    );
    this.mesh.receiveShadow = true;
    this.mesh.position.y = terrain.waterLevel;
    scene.add(this.mesh);
  }

  /** Call every render frame. */
  follow(focus: THREE.Vector3, dt: number): void {
    // Snap to whole ripple tiles so the pattern doesn't slide with the player.
    this.mesh.position.x = Math.round(focus.x / 90) * 90;
    this.mesh.position.z = Math.round(focus.z / 90) * 90;
    this.time += dt;
    this.normals.offset.set(this.time * 0.004, this.time * 0.0025);
  }
}

/** Soft overlapping ripples encoded as a tangent-space normal map. */
function rippleNormals(): THREE.CanvasTexture {
  const n = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const h = (x: number, y: number) => {
    const u = (x / n) * Math.PI * 2;
    const v = (y / n) * Math.PI * 2;
    return Math.sin(u * 3 + Math.sin(v * 2) * 1.5) * 0.5 + Math.sin(v * 5 + u * 2) * 0.3 + Math.sin((u - v) * 7) * 0.15;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const len = Math.hypot(dx, dy, 1);
      const o = (y * n + x) * 4;
      img.data[o] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[o + 1] = (-dy / len * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
