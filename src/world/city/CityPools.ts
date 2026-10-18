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

/** What ChunkManager and CollapseSystem need from a pool. */
export interface InstanceSink {
  readonly used: number;
  add(matrix: THREE.Matrix4, color: THREE.Color, variant?: number): number;
  remove(slot: number): void;
  setMatrix(slot: number, m: THREE.Matrix4): void;
  getMatrix(slot: number, out: THREE.Matrix4): THREE.Matrix4;
  setColor(slot: number, c: THREE.Color): void;
  getColor(slot: number, out: THREE.Color): THREE.Color;
  flush(): void;
}

/** One shared instanced pool per city part type (~8 draw calls for the whole city). */
export class CityPools {
  readonly pools: Record<CityPoolId, InstanceSink>;
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

    const { car, truck } = vehicleGeometries();

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
      car: new InstancePool(scene, car, lambert({ vertexColors: true, flatShading: true }), 4000),
      truck: new InstancePool(scene, truck, lambert({ vertexColors: true, flatShading: true }), 1500),
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

  /** Small-prop shadows on/off (quality preset). */
  setSmallShadows(on: boolean): void {
    for (const id of ['tree', 'roof', 'car', 'truck'] as const) (this.pools[id] as InstancePool).setCastShadow(on);
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

const GLASS = 0x26303a;
const UNDERSIDE = 0x232323;

/**
 * Unit-size vehicles (1 x 1 x 1, base at y = 0, front at +Z), scaled per part.
 * Painted parts stay white so the instance color sets the paint job; glass and
 * wheels are dark and stay dark.
 */
function vehicleGeometries(): { car: THREE.BufferGeometry; truck: THREE.BufferGeometry } {
  const box = (w: number, h: number, d: number, y: number, z: number, hex: number) =>
    paint(new THREE.BoxGeometry(w, h, d).translate(0, y + h / 2, z), hex).toNonIndexed();
  const car = mergeGeometries([
    box(1.02, 0.26, 0.72, 0, 0, UNDERSIDE),
    box(1, 0.36, 1, 0.2, 0, 0xffffff),
    box(0.9, 0.3, 0.5, 0.56, -0.06, GLASS),
    box(0.86, 0.1, 0.44, 0.86, -0.07, 0xffffff),
  ]);
  const truck = mergeGeometries([
    box(1.02, 0.18, 0.9, 0, 0, UNDERSIDE),
    box(1, 0.42, 0.22, 0.16, 0.39, 0xffffff),
    box(0.96, 0.22, 0.2, 0.58, 0.39, GLASS),
    box(1, 0.08, 0.22, 0.8, 0.39, 0xffffff),
    box(1, 0.84, 0.74, 0.16, -0.12, 0xe8e6e0),
  ]);
  return { car, truck };
}

function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes['position']!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}
