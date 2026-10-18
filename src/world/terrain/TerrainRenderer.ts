import * as THREE from 'three';
import type { TerrainTileData } from './Terrain';

/** How far (m) skirts hang below tile edges to hide cracks between detail levels. */
const SKIRT = 30;
const _c = new THREE.Color();

interface Lod {
  /** Cells per edge (the tile data is subsampled to this). */
  readonly cells: number;
  readonly scratch: THREE.BufferGeometry;
  readonly free: number[];
}

interface Tile {
  readonly x0: number;
  readonly z0: number;
  readonly data: TerrainTileData;
  instance: number;
  geometry: number;
  near: boolean;
}

/**
 * Ground for every loaded chunk in ONE BatchedMesh (one draw call): a tile per
 * chunk, full detail near the player and half detail beyond. Geometry slots are
 * recycled, so streaming never reallocates GPU buffers. Low-poly look: flat
 * shading over per-vertex colors from the terrain.
 */
export class TerrainRenderer {
  readonly mesh: THREE.BatchedMesh;
  private readonly tiles = new Map<string, Tile>();
  private readonly near: Lod;
  private readonly far: Lod;
  /** Tiles whose chunk center is within this radius use full detail. */
  nearRadius = 700;

  constructor(scene: THREE.Scene, private readonly size: number, cells: number, maxTiles: number, maxNearTiles = 140) {
    this.near = { cells, scratch: tileGeometry(cells), free: [] };
    this.far = { cells: cells / 2, scratch: tileGeometry(cells / 2), free: [] };
    const nv = this.near.scratch.attributes['position']!.count;
    const ni = this.near.scratch.index!.count;
    const fv = this.far.scratch.attributes['position']!.count;
    const fi = this.far.scratch.index!.count;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new THREE.BatchedMesh(maxTiles, maxNearTiles * nv + maxTiles * fv, maxNearTiles * ni + maxTiles * fi, material);
    this.mesh.receiveShadow = true;
    this.mesh.sortObjects = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  get count(): number {
    return this.tiles.size;
  }

  add(cx: number, cz: number, data: TerrainTileData, focusX: number, focusZ: number): void {
    const key = `${cx},${cz}`;
    if (this.tiles.has(key)) return;
    const x0 = cx * this.size;
    const z0 = cz * this.size;
    const near = this.isNear(x0, z0, focusX, focusZ, 0);
    const geometry = this.fill(near ? this.near : this.far, x0, z0, data);
    const instance = this.mesh.addInstance(geometry);
    this.tiles.set(key, { x0, z0, data, instance, geometry, near });
  }

  remove(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    const t = this.tiles.get(key);
    if (!t) return;
    this.mesh.deleteInstance(t.instance);
    (t.near ? this.near : this.far).free.push(t.geometry);
    this.tiles.delete(key);
  }

  /** Swap detail levels as the player moves (a few tiles per call at most). */
  update(focusX: number, focusZ: number, maxSwaps = 4): void {
    let swaps = 0;
    for (const t of this.tiles.values()) {
      const near = this.isNear(t.x0, t.z0, focusX, focusZ, t.near ? 64 : -64);
      if (near === t.near) continue;
      (t.near ? this.near : this.far).free.push(t.geometry);
      t.geometry = this.fill(near ? this.near : this.far, t.x0, t.z0, t.data);
      t.near = near;
      this.mesh.setGeometryIdAt(t.instance, t.geometry);
      if (++swaps >= maxSwaps) return;
    }
  }

  private isNear(x0: number, z0: number, fx: number, fz: number, hysteresis: number): boolean {
    const h = this.size / 2;
    return Math.hypot(x0 + h - fx, z0 + h - fz) < this.nearRadius + hysteresis;
  }

  /** Write a tile into a free geometry slot of this detail level; returns the geometry id. */
  private fill(lod: Lod, x0: number, z0: number, data: TerrainTileData): number {
    const g = lod.scratch;
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    const col = g.attributes['color'] as THREE.BufferAttribute;
    const n = lod.cells;
    const m = n + 1;
    const stride = data.n / n;
    const dm = data.n + 1;
    const step = this.size / n;
    let v = 0;
    const put = (i: number, j: number, drop: number) => {
      const k = (j * stride) * dm + i * stride;
      pos.setXYZ(v, x0 + i * step, data.heights[k]! - drop, z0 + j * step);
      _c.setRGB(data.colors[k * 3]!, data.colors[k * 3 + 1]!, data.colors[k * 3 + 2]!, THREE.SRGBColorSpace);
      col.setXYZ(v, _c.r, _c.g, _c.b);
      v++;
    };
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) put(i, j, 0);
    // Skirts, in the same edge order tileGeometry() indexes them.
    for (let i = 0; i < m; i++) put(i, 0, SKIRT);
    for (let i = 0; i < m; i++) put(i, n, SKIRT);
    for (let j = 0; j < m; j++) put(0, j, SKIRT);
    for (let j = 0; j < m; j++) put(n, j, SKIRT);
    pos.needsUpdate = col.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();

    const id = lod.free.pop();
    if (id !== undefined) {
      this.mesh.setGeometryAt(id, g);
      return id;
    }
    return this.mesh.addGeometry(g);
  }
}

/** Index buffer + empty attributes for an n x n cell tile with skirts on all four edges. */
function tileGeometry(n: number): THREE.BufferGeometry {
  const m = n + 1;
  const count = m * m + 4 * m;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const idx: number[] = [];
  const at = (i: number, j: number) => j * m + i;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i, j + 1);
      const d = at(i + 1, j + 1);
      // Alternate the diagonal for a less regular facet pattern.
      if ((i + j) % 2) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
  }
  // Skirt strips: top edge vertex k pairs with skirt vertex base + k.
  const strip = (edge: (k: number) => number, base: number, flip: boolean) => {
    for (let k = 0; k < n; k++) {
      const a = edge(k);
      const b = edge(k + 1);
      const c = base + k;
      const d = base + k + 1;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  };
  const s = m * m;
  // Winding so each skirt faces outward.
  strip((k) => at(k, 0), s, true);
  strip((k) => at(k, n), s + m, false);
  strip((k) => at(0, k), s + 2 * m, false);
  strip((k) => at(n, k), s + 3 * m, true);
  g.setIndex(idx);
  return g;
}
