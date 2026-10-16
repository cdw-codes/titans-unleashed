import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MODELS } from '../config/models';

/** A model baked for instancing: one geometry (base at y=0, centered, length 1 along +Z) + material. */
export interface BakedModel {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

export interface LoadedModels {
  /** Car variants sharing one textured material (Kenney colormap), or null. */
  cars: { geometries: THREE.BufferGeometry[]; material: THREE.Material } | null;
  /** Tank variants (vertex-colored), possibly empty. */
  tanks: BakedModel[];
}

const _m = new THREE.Matrix4();

/** Loads and bakes the optional downloaded models. Never throws: missing files → null/empty. */
export async function loadModels(): Promise<LoadedModels> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const base = import.meta.env.BASE_URL;
  const load = async (file: string): Promise<GLTF | null> => {
    try {
      return await loader.loadAsync(base + file);
    } catch {
      if (import.meta.env.DEV) console.info(`[models] ${file} not available, using code-built fallback`);
      return null;
    }
  };

  const [carsGltf, ...tankGltfs] = await Promise.all([load(MODELS.cars), ...MODELS.tanks.map((t) => load(t.file))]);

  let cars: LoadedModels['cars'] = null;
  if (carsGltf) {
    const geometries: THREE.BufferGeometry[] = [];
    let map: THREE.Texture | null = null;
    for (const scene of carsGltf.scenes) {
      const meshes = collectMeshes(scene);
      const first = meshes[0]?.material;
      if (!map && first instanceof THREE.MeshStandardMaterial) map = first.map;
      const g = bakeMeshes(meshes, { keepUv: true, vertexColors: false });
      if (g) geometries.push(normalize(g, 0, 0));
    }
    if (geometries.length) {
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      cars = { geometries, material: new THREE.MeshLambertMaterial({ map }) };
    }
  }

  const tanks: BakedModel[] = [];
  tankGltfs.forEach((gltf, i) => {
    if (!gltf) return;
    const g = bakeMeshes(collectMeshes(gltf.scene), { keepUv: false, vertexColors: true });
    const t = MODELS.tanks[i]!;
    if (g) tanks.push({ geometry: normalize(g, t.yawOffset, t.pitchOffset), material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) });
  });

  if (import.meta.env.DEV) console.info(`[models] cars: ${cars?.geometries.length ?? 0} variants, tanks: ${tanks.length}`);
  return { cars, tanks };
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

/**
 * Bake world transforms into one geometry. With `vertexColors`, each mesh's
 * material base color is written into a color attribute (untextured packs).
 */
function bakeMeshes(meshes: THREE.Mesh[], o: { keepUv: boolean; vertexColors: boolean }): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    // Split by material groups (multi-primitive meshes) so each gets its color.
    const groups = src.groups.length ? src.groups : [{ start: 0, count: src.attributes['position']!.count, materialIndex: 0 }];
    for (const grp of groups) {
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', ...(o.keepUv ? ['uv'] : [])]) {
        const a = src.getAttribute(name);
        if (a) g.setAttribute(name, toFloat(a, grp.start, grp.count));
      }
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      if (o.vertexColors) {
        const mat = mats[grp.materialIndex ?? 0] as THREE.MeshStandardMaterial | undefined;
        const c = mat?.color ?? new THREE.Color(1, 1, 1);
        const n = g.getAttribute('position').count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
      g.applyMatrix4(_m.copy(mesh.matrixWorld));
      parts.push(g);
    }
  }
  return parts.length ? mergeGeometries(parts) : null;
}

/**
 * Copy a (possibly quantized / normalized / interleaved) attribute range into a
 * plain Float32 attribute. Meshopt-compressed files store positions as int16:
 * copying the raw array would lose the normalization and collapse the mesh.
 */
function toFloat(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, start: number, count: number): THREE.BufferAttribute {
  const n = a.itemSize;
  const out = new Float32Array(count * n);
  const get = [a.getX, a.getY, a.getZ, a.getW] as const;
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < n; k++) out[i * n + k] = get[k]!.call(a, start + i);
  }
  return new THREE.BufferAttribute(out, n);
}

/** Center on X/Z, sit on y=0, rotate by yawOffset, scale so the longest horizontal side is 1. */
function normalize(g: THREE.BufferGeometry, yawOffset: number, pitchOffset: number): THREE.BufferGeometry {
  if (pitchOffset) g.rotateX(pitchOffset);
  if (yawOffset) g.rotateY(yawOffset);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  const len = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) || 1;
  g.scale(1 / len, 1 / len, 1 / len);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
