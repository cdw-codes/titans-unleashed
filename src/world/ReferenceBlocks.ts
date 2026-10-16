import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsSystem } from '../systems/PhysicsSystem';

/**
 * Static scale-reference towers scattered at increasing distance, so fog depth,
 * shadows and the kaiju's size can be judged before the city exists.
 * One InstancedMesh = one draw call (plus one for the shadow pass).
 */
export function createReferenceBlocks(scene: THREE.Scene, physics: PhysicsSystem, seed = 1): THREE.InstancedMesh {
  let s = seed;
  const rand = (): number => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

  const count = 140;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const ring = i < 20 ? 150 + rand() * 250 : 400 + rand() * 2400;
    const angle = rand() * Math.PI * 2;
    const x = Math.cos(angle) * ring;
    const z = Math.sin(angle) * ring;
    const tall = rand() < 0.25;
    const w = 15 + rand() * 25;
    const d = 15 + rand() * 25;
    const h = tall ? 60 + rand() * 90 : 8 + rand() * 30;
    m.makeScale(w, h, d).setPosition(x, 0, z);
    mesh.setMatrixAt(i, m);
    color.setHSL(0.08 + rand() * 0.06, 0.08, 0.45 + rand() * 0.3);
    mesh.setColorAt(i, color);

    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, h / 2, z));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2), body);
  }
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}
