import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Code-built low-poly military models, authored at real-world-ish size in
 * meters (tank ~1 unit long, scaled by config length). Each is a merged
 * geometry rendered through an InstancedMesh: one draw call per part type.
 */

const paint = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
  const c = new THREE.Color(hex);
  const n = g.attributes['position']!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
};

const OLIVE = 0x5b6440;
const OLIVE_DARK = 0x3f452c;
const TRACK = 0x2b2b28;
const GREY = 0x55595c;
const GREY_DARK = 0x35383a;

/** Hull + tracks, length 1 along +Z (front). */
export function tankHullGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.BoxGeometry(0.5, 0.18, 0.92).translate(0, 0.17, 0), OLIVE),
    paint(new THREE.BoxGeometry(0.42, 0.08, 0.3).translate(0, 0.3, 0.3).rotateX(0), OLIVE_DARK),
    paint(new THREE.BoxGeometry(0.13, 0.16, 1).translate(0.28, 0.08, 0), TRACK),
    paint(new THREE.BoxGeometry(0.13, 0.16, 1).translate(-0.28, 0.08, 0), TRACK),
  ]);
}

/** Turret + barrel, pivot at the hull top, barrel along +Z. */
export function tankTurretGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.BoxGeometry(0.36, 0.14, 0.4).translate(0, 0.33, -0.04), OLIVE),
    paint(new THREE.CylinderGeometry(0.028, 0.032, 0.6, 6).rotateX(Math.PI / 2).translate(0, 0.34, 0.42), OLIVE_DARK),
  ]);
}

/** Fuselage + tail boom + skids, ~1 unit long along +Z (nose). */
export function heliBodyGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.IcosahedronGeometry(0.5, 1).scale(0.32, 0.3, 0.6).translate(0, 0.25, 0.1), GREY),
    paint(new THREE.BoxGeometry(0.08, 0.08, 0.6).translate(0, 0.3, -0.45), GREY_DARK),
    paint(new THREE.BoxGeometry(0.02, 0.18, 0.1).translate(0, 0.38, -0.72), GREY_DARK),
    paint(new THREE.BoxGeometry(0.03, 0.03, 0.55).translate(0.16, 0.0, 0.1), GREY_DARK),
    paint(new THREE.BoxGeometry(0.03, 0.03, 0.55).translate(-0.16, 0.0, 0.1), GREY_DARK),
    // Stub wings with rocket pods.
    paint(new THREE.BoxGeometry(0.5, 0.03, 0.08).translate(0, 0.22, 0.05), GREY_DARK),
  ]);
}

/** Two crossed blades, pivot at the mast. */
export function heliRotorGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.BoxGeometry(1.1, 0.01, 0.05), 0x222222),
    paint(new THREE.BoxGeometry(0.05, 0.01, 1.1), 0x222222),
  ]);
}

/** Elongated tracer along +Z. */
export function tracerGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

export function unitMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number, shadows = true): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, capacity);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}
