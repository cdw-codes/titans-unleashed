import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Random } from '../core/random';
import type { PhysicsSystem } from '../systems/PhysicsSystem';
import { createBuildingMaterial } from './materials/buildingMaterial';

/**
 * Milestone-2 scale test area: a hand-tuned street grid around the spawn with
 * suburbs (houses, trees) behind, mid-rises ahead and downtown towers beyond,
 * parked cars, and a distant skyline ring for fog depth. Everything is
 * instanced: ~7 draw calls (+ shadows). Replaced by the streamed city in M3.
 *
 * Only mid-rises and towers have colliders; houses, trees and cars are left
 * walk-through until crushing exists (M3).
 */

const BLOCK = 100;
const STREET = 28;
const PITCH = BLOCK + STREET;
const SPAWN_CLEAR = 110;

interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  color: THREE.Color;
}

export class TestArea {
  readonly group = new THREE.Group();
  private readonly rng = new Random(1337);
  private readonly buildings: Box[] = [];
  private readonly houses: Box[] = [];
  private readonly trees: { x: number; z: number; s: number; rot: number }[] = [];
  private readonly cars: Box[] = [];
  private readonly roads: { x: number; z: number; w: number; d: number }[] = [];

  constructor(scene: THREE.Scene, private readonly physics: PhysicsSystem) {
    this.layout();
    this.skyline();
    this.build();
    scene.add(this.group);
  }

  private layout(): void {
    const iMin = -3, iMax = 3, jMin = -3, jMax = 6;

    for (let i = iMin; i <= iMax; i++) {
      for (let j = jMin; j <= jMax; j++) {
        const cx = i * PITCH;
        const cz = j * PITCH;
        if (Math.hypot(cx, cz) < SPAWN_CLEAR) continue;
        if (j < 0) this.suburbBlock(cx, cz);
        else if (j < 3 || Math.abs(i) >= 3) this.midriseBlock(cx, cz);
        else this.downtownBlock(cx, cz);
      }
    }

    // Streets on the grid lines between blocks, with parked cars on both curbs.
    const x0 = (iMin - 0.5) * PITCH, x1 = (iMax + 0.5) * PITCH;
    const z0 = (jMin - 0.5) * PITCH, z1 = (jMax + 0.5) * PITCH;
    for (let i = iMin - 1; i <= iMax; i++) {
      const x = (i + 0.5) * PITCH;
      this.roads.push({ x, z: (z0 + z1) / 2, w: STREET, d: z1 - z0 });
      this.parkCars(x, z0, z1, true);
    }
    for (let j = jMin - 1; j <= jMax; j++) {
      const z = (j + 0.5) * PITCH;
      this.roads.push({ x: (x0 + x1) / 2, z, w: x1 - x0, d: STREET });
      this.parkCars(z, x0, x1, false);
    }
  }

  private suburbBlock(cx: number, cz: number): void {
    const r = this.rng;
    const lots = 4;
    const lot = BLOCK / lots;
    for (let a = 0; a < lots; a++) {
      for (let b = 0; b < lots; b++) {
        const x = cx - BLOCK / 2 + (a + 0.5) * lot;
        const z = cz - BLOCK / 2 + (b + 0.5) * lot;
        if (r.chance(0.82)) {
          const w = r.range(9, 13);
          const d = r.range(8, 11);
          this.houses.push({
            x, z, w, d,
            h: r.range(5, 7.5),
            rot: r.pick([0, Math.PI / 2]),
            color: new THREE.Color().setHSL(r.range(0.05, 0.14), r.range(0.15, 0.35), r.range(0.55, 0.78)),
          });
        }
        for (let t = 0; t < 2; t++) {
          if (r.chance(0.55)) {
            this.trees.push({
              x: x + r.range(-lot / 2, lot / 2),
              z: z + r.range(-lot / 2, lot / 2),
              s: r.range(1, 1.7),
              rot: r.range(0, Math.PI * 2),
            });
          }
        }
      }
    }
  }

  private midriseBlock(cx: number, cz: number): void {
    const r = this.rng;
    const half = BLOCK / 4;
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      if (r.chance(0.12)) continue;
      const w = r.range(28, 44);
      const d = r.range(28, 44);
      this.buildings.push({
        x: cx + ox * half, z: cz + oz * half, w, d,
        h: r.range(16, 52),
        rot: 0,
        color: new THREE.Color().setHSL(r.range(0.04, 0.12), r.range(0.05, 0.2), r.range(0.45, 0.72)),
      });
    }
  }

  private downtownBlock(cx: number, cz: number): void {
    const r = this.rng;
    if (r.chance(0.5)) {
      this.buildings.push({
        x: cx, z: cz, w: r.range(60, 80), d: r.range(60, 80), h: r.range(95, 175), rot: 0,
        color: new THREE.Color().setHSL(r.range(0.55, 0.62), r.range(0.05, 0.15), r.range(0.4, 0.62)),
      });
    } else {
      for (const ox of [-1, 1]) {
        this.buildings.push({
          x: cx + ox * 24, z: cz + r.range(-15, 15), w: r.range(32, 42), d: r.range(45, 75), h: r.range(60, 140), rot: 0,
          color: new THREE.Color().setHSL(r.range(0.06, 0.6), r.range(0.03, 0.12), r.range(0.42, 0.7)),
        });
      }
    }
  }

  private parkCars(line: number, from: number, to: number, alongZ: boolean): void {
    const r = this.rng;
    for (const side of [-1, 1]) {
      let t = from + r.range(5, 20);
      while (t < to - 5) {
        const a = alongZ ? line + side * (STREET / 2 - 3.5) : t;
        const b = alongZ ? t : line + side * (STREET / 2 - 3.5);
        if (Math.hypot(a, b) > 40) {
          this.cars.push({
            x: a, z: b, w: 1.9, d: 4.6, h: 1.6, rot: alongZ ? 0 : Math.PI / 2,
            color: new THREE.Color().setHSL(r.next(), r.range(0.2, 0.7), r.range(0.25, 0.65)),
          });
        }
        t += r.range(7, 26);
      }
    }
  }

  private skyline(): void {
    const r = this.rng;
    for (let n = 0; n < 160; n++) {
      const dist = r.range(1100, 2900);
      const ang = r.range(0, Math.PI * 2);
      this.buildings.push({
        x: Math.cos(ang) * dist, z: Math.sin(ang) * dist,
        w: r.range(30, 70), d: r.range(30, 70), h: r.chance(0.35) ? r.range(90, 220) : r.range(20, 70), rot: 0,
        color: new THREE.Color().setHSL(r.range(0.05, 0.6), r.range(0.03, 0.12), r.range(0.45, 0.7)),
      });
    }
  }

  // ------------------------------------------------------------------ build

  private build(): void {
    const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

    // Buildings: windowed material, static colliders.
    const buildings = this.instanced(unitBox, createBuildingMaterial(), this.buildings, (b) => [b.w, b.h, b.d]);
    for (const b of this.buildings) {
      const body = this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(b.x, b.h / 2, b.z));
      this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2), body);
    }

    // Houses: windowed walls + pitched roofs.
    const houses = this.instanced(unitBox, createBuildingMaterial(), this.houses, (b) => [b.w, b.h, b.d]);
    const roofShape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
    const roofs = this.instanced(
      roofGeo,
      new THREE.MeshLambertMaterial({ color: 0x8a4b3a, flatShading: true }),
      this.houses,
      (b) => [b.w * 1.08, b.h * 0.55, b.d * 1.05],
      (b) => b.h,
      () => new THREE.Color().setHSL(0.03, 0.35, 0.3 + this.rng.next() * 0.15),
    );

    // Trees: merged trunk + crown, vertex colored.
    const trunk = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 5).translate(0, 1.6, 0);
    const crown = new THREE.IcosahedronGeometry(2.8, 0).translate(0, 5.2, 0);
    paint(trunk, 0x5a4330);
    paint(crown, 0x4c6b35);
    const treeGeo = mergeGeometries([trunk.toNonIndexed(), crown.toNonIndexed()]);
    const trees = this.instanced(
      treeGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      this.trees.map((t) => ({ x: t.x, z: t.z, w: t.s, d: t.s, h: t.s, rot: t.rot, color: new THREE.Color(1, 1, 1) })),
      (b) => [b.w, b.h, b.d],
    );

    const cars = this.instanced(
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      this.cars,
      (b) => [b.w, b.h, b.d],
    );

    const roadMat = new THREE.MeshLambertMaterial({ color: 0x3c3d3f, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const roadGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const roads = this.instanced(
      roadGeo,
      roadMat,
      this.roads.map((r) => ({ ...r, h: 1, rot: 0, color: new THREE.Color(1, 1, 1) })),
      (b) => [b.w, 1, b.d],
      () => 0.02,
    );
    roads.castShadow = false;

    this.group.add(buildings, houses, roofs, trees, cars, roads);
  }

  private instanced(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    items: Box[],
    scale: (b: Box) => [number, number, number],
    y: (b: Box) => number = () => 0,
    color: (b: Box) => THREE.Color = (b) => b.color,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    items.forEach((b, i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, b.rot);
      s.set(...scale(b));
      p.set(b.x, y(b), b.z);
      mesh.setMatrixAt(i, m.compose(p, q, s));
      mesh.setColorAt(i, color(b));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

function paint(g: THREE.BufferGeometry, hex: number): void {
  const c = new THREE.Color(hex);
  const n = g.attributes['position']!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
}
