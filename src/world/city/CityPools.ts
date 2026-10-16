import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { InstancePool } from '../../systems/InstancePool';
import { createBuildingMaterial } from '../materials/buildingMaterial';
import type { PartSpec, PoolId } from './types';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export type CityPoolId = PoolId | 'rubble';

/** One shared instanced pool per city part type (~8 draw calls for the whole city). */
export class CityPools {
  readonly pools: Record<CityPoolId, InstancePool>;

  constructor(scene: THREE.Scene) {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const lambert = (opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...opts });

    const roofShape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
    const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);

    const trunk = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 5).translate(0, 1.6, 0);
    const crown = new THREE.IcosahedronGeometry(2.8, 0).translate(0, 5.2, 0);
    paint(trunk, 0x5a4330);
    paint(crown, 0x4c6b35);
    const tree = mergeGeometries([trunk.toNonIndexed(), crown.toNonIndexed()]);

    // Car: body + cabin, merged.
    const body = new THREE.BoxGeometry(1, 0.55, 1).translate(0, 0.3, 0);
    const cabin = new THREE.BoxGeometry(0.9, 0.4, 0.55).translate(0, 0.75, -0.05);
    const car = mergeGeometries([body, cabin]);

    // Rubble: a low, lumpy mound.
    const rubble = new THREE.ConeGeometry(0.6, 1, 7, 1).translate(0, 0.5, 0);
    const pos = rubble.attributes['position']!;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0.01) pos.setXYZ(i, pos.getX(i) * (0.8 + Math.sin(i * 12.9) * 0.2), 0, pos.getZ(i) * (0.8 + Math.cos(i * 7.3) * 0.2));
    }
    rubble.computeVertexNormals();

    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

    this.pools = {
      windowed: new InstancePool(scene, box, createBuildingMaterial(), 6000),
      plain: new InstancePool(scene, box, lambert(), 6000),
      roof: new InstancePool(scene, roof, lambert({ flatShading: true }), 6000),
      cylinder: new InstancePool(scene, new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0), lambert(), 1000),
      tree: new InstancePool(scene, tree, lambert({ vertexColors: true, flatShading: true }), 6000),
      car: new InstancePool(scene, car, lambert(), 4000),
      flat: new InstancePool(
        scene,
        flat,
        lambert({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        4000,
        { castShadow: false },
      ),
      rubble: new InstancePool(scene, rubble, lambert({ flatShading: true }), 1000),
    };
  }

  addPart(p: PartSpec): number {
    return this.pools[p.pool].add(partMatrix(p, _m), _c.setHex(p.color));
  }

  removePart(pool: CityPoolId, slot: number): void {
    this.pools[pool].remove(slot);
  }

  flush(): void {
    for (const p of Object.values(this.pools)) p.flush();
  }

  get totalInstances(): number {
    return Object.values(this.pools).reduce((n, p) => n + p.used, 0);
  }
}

export function partMatrix(p: PartSpec, out: THREE.Matrix4): THREE.Matrix4 {
  _q.setFromAxisAngle(UP, p.rotY);
  _p.set(p.x, p.y, p.z);
  _s.set(p.sx, p.sy, p.sz);
  return out.compose(_p, _q, _s);
}

function paint(g: THREE.BufferGeometry, hex: number): void {
  const c = new THREE.Color(hex);
  const n = g.attributes['position']!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
}
