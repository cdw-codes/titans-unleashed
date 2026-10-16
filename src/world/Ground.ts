import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ENVIRONMENT as ENV } from '../config/environment';
import { WORLD } from '../config/world';
import type { PhysicsSystem } from '../systems/PhysicsSystem';

/**
 * Placeholder ground: a tiled plane with a 10 m grid (for reading scale) that
 * recenters on the player in whole-tile steps, plus a recentering static slab collider.
 * The city replaces most of this visually in Milestone 3.
 */
export class Ground {
  readonly mesh: THREE.Mesh;
  private readonly size: number;
  private readonly body: RAPIER.RigidBody;

  constructor(scene: THREE.Scene, physics: PhysicsSystem, maxAnisotropy: number, drawDistance: number) {
    this.size = Math.ceil((drawDistance * 2.2) / ENV.groundTile) * ENV.groundTile;
    const texture = this.createTexture(maxAnisotropy);
    texture.repeat.set(this.size / ENV.groundTile, this.size / ENV.groundTile);

    const geometry = new THREE.PlaneGeometry(this.size, this.size);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ map: texture }),
    );
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);

    const h = WORLD.groundHalfSize;
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(h, 5, h).setFriction(0.9), this.body);
  }

  follow(focus: THREE.Vector3): void {
    const t = ENV.groundTile;
    const x = Math.round(focus.x / t) * t;
    const z = Math.round(focus.z / t) * t;
    if (x !== this.mesh.position.x || z !== this.mesh.position.z) {
      this.mesh.position.set(x, 0, z);
      this.mesh.updateMatrix();
    }
    // Recenter the physics slab well before the player nears its edge.
    const t2 = this.body.translation();
    if (Math.abs(focus.x - t2.x) > WORLD.groundHalfSize / 4 || Math.abs(focus.z - t2.z) > WORLD.groundHalfSize / 4) {
      this.body.setTranslation({ x: x, y: -5, z: z }, false);
    }
  }

  private createTexture(maxAnisotropy: number): THREE.CanvasTexture {
    const px = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');

    ctx.fillStyle = `#${ENV.groundColor.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, px, px);
    // Mottling so the ground doesn't read as a flat color at distance.
    for (let i = 0; i < 4000; i++) {
      const v = Math.random() * 30 - 15;
      ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 400})`;
      const s = 2 + Math.random() * 10;
      ctx.fillRect(Math.random() * px, Math.random() * px, s, s);
    }
    ctx.strokeStyle = `#${ENV.groundLineColor.toString(16).padStart(6, '0')}`;
    const step = px / 10;
    for (let i = 0; i <= 10; i++) {
      ctx.lineWidth = i % 10 === 0 ? 6 : 2;
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, px);
      ctx.moveTo(0, i * step);
      ctx.lineTo(px, i * step);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, maxAnisotropy);
    return tex;
  }
}
