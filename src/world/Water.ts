import * as THREE from 'three';
import { ENVIRONMENT as ENV } from '../config/environment';
import { CITY } from '../config/city';

/** Sea east of the coast: one plane that slides along z with the player. */
export class Water {
  readonly mesh: THREE.Mesh;
  private readonly length: number;

  constructor(scene: THREE.Scene, drawDistance: number) {
    this.length = drawDistance * 2.5;
    const geo = new THREE.PlaneGeometry(this.length, this.length).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshPhongMaterial({ color: ENV.waterColor, specular: 0x6f8ea0, shininess: 70 }),
    );
    this.mesh.receiveShadow = true;
    this.mesh.position.set(CITY.coastX + this.length / 2, ENV.waterLevel, 0);
    scene.add(this.mesh);
  }

  follow(focus: THREE.Vector3): void {
    this.mesh.position.z = Math.round(focus.z / 64) * 64;
  }
}
