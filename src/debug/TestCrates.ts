import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsSystem } from '../systems/PhysicsSystem';
import { PhysicsInstances } from '../systems/PhysicsInstances';

const CAPACITY = 400;
const _scale = new THREE.Vector3();

/** Dev tool: drop physics crates to verify Rapier, interpolation and body counts. */
export class TestCrates {
  readonly instances: PhysicsInstances;

  constructor(scene: THREE.Scene, private readonly physics: PhysicsSystem) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xb8743c });
    this.instances = new PhysicsInstances(geo, mat, CAPACITY);
    scene.add(this.instances.mesh);
  }

  spawn(count: number, around: THREE.Vector3): void {
    for (let i = 0; i < count; i++) {
      const s = 4 + Math.random() * 8;
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
      );
      const body = this.physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(
            around.x + (Math.random() - 0.5) * 120,
            120 + Math.random() * 150,
            around.z + (Math.random() - 0.5) * 120,
          )
          .setRotation(q),
      );
      this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(s / 2, s / 2, s / 2).setDensity(0.5), body);
      if (this.instances.add(body, _scale.set(s, s, s)) < 0) {
        this.physics.world.removeRigidBody(body);
        return;
      }
    }
  }
}
