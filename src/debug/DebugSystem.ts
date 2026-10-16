import * as THREE from 'three';
import type { PhysicsSystem } from '../systems/PhysicsSystem';
import { WORLD } from '../config/world';
import { DebugDraw } from './DebugDraw';
import { DebugLabels } from './DebugLabels';

export interface DebugFrameInfo {
  frameMs: number;
  steps: number;
  quality: string;
  focus: THREE.Vector3;
  /** Extra overlay lines from gameplay systems (chunks, debris...). Only read when debug is on. */
  extra: () => string[];
}

const CHUNK_RADIUS = 4;

/**
 * F1 debug mode: stats overlay (FPS, draw calls, bodies), Rapier collider
 * wireframes, chunk grid, plus DebugDraw/DebugLabels for gameplay systems.
 */
export class DebugSystem {
  enabled = false;
  showColliders = true;
  showChunks = true;
  readonly draw = new DebugDraw();
  readonly labels: DebugLabels;

  private readonly overlay: HTMLDivElement;
  private readonly colliderLines: THREE.LineSegments;
  private readonly chunkGrid: THREE.LineSegments;
  private fpsSmoothed = 60;
  private msSmoothed = 16.7;
  private overlayTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.Camera,
    private readonly physics: PhysicsSystem,
    uiRoot: HTMLElement,
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'debug-overlay';
    uiRoot.appendChild(this.overlay);
    this.labels = new DebugLabels(uiRoot);

    this.colliderLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.8 }),
    );
    this.colliderLines.frustumCulled = false;

    this.chunkGrid = this.createChunkGrid();
    this.setEnabled(false);
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.overlay.style.display = on ? '' : 'none';
    this.labels.visible = on;
    const objs = [this.colliderLines, this.chunkGrid, this.draw.lines];
    for (const o of objs) {
      if (on) this.scene.add(o);
      else this.scene.remove(o);
    }
    this.draw.clear();
  }

  /** World-anchored text for this frame (AI state, HP...). No-op when debug is off. */
  label(world: THREE.Vector3Like, text: string): void {
    if (this.enabled) this.labels.draw(world, text, this.camera);
  }

  /** Before render: upload debug geometry. */
  preRender(info: DebugFrameInfo): void {
    if (!this.enabled) return;
    this.colliderLines.visible = this.showColliders;
    if (this.showColliders) this.updateColliders();
    this.chunkGrid.visible = this.showChunks;
    if (this.showChunks) {
      const c = WORLD.chunkSize;
      this.chunkGrid.position.set(Math.floor(info.focus.x / c) * c, 0.5, Math.floor(info.focus.z / c) * c);
    }
    this.draw.flush();
  }

  /** After render: render stats are only valid now. */
  postRender(info: DebugFrameInfo): void {
    if (!this.enabled) return;
    this.draw.clear();
    this.labels.endFrame();

    const fps = info.frameMs > 0 ? 1000 / info.frameMs : 0;
    this.fpsSmoothed += (fps - this.fpsSmoothed) * 0.05;
    this.msSmoothed += (info.frameMs - this.msSmoothed) * 0.05;
    this.overlayTimer += info.frameMs;
    if (this.overlayTimer < 250) return;
    this.overlayTimer = 0;

    const r = this.renderer.info;
    const bodies = this.physics.countBodies();
    const c = WORLD.chunkSize;
    this.overlay.textContent = [
      `FPS        ${this.fpsSmoothed.toFixed(0)}  (${this.msSmoothed.toFixed(1)} ms)`,
      `sim steps  ${info.steps}/frame`,
      `draw calls ${r.render.calls}`,
      `triangles  ${(r.render.triangles / 1000).toFixed(1)}k`,
      `geo / tex  ${r.memory.geometries} / ${r.memory.textures}`,
      `bodies     ${bodies.active} active / ${bodies.total}`,
      `quality    ${info.quality}`,
      `pos        ${info.focus.x.toFixed(0)}, ${info.focus.z.toFixed(0)}`,
      `chunk      ${Math.floor(info.focus.x / c)}, ${Math.floor(info.focus.z / c)}`,
      ...info.extra(),
      '',
      'F1 toggles debug',
    ].join('\n');
  }

  private updateColliders(): void {
    const { vertices, colors } = this.physics.world.debugRender();
    const g = this.colliderLines.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }

  private createChunkGrid(): THREE.LineSegments {
    const c = WORLD.chunkSize;
    const n = CHUNK_RADIUS;
    const pts: number[] = [];
    for (let i = -n; i <= n + 1; i++) {
      pts.push(i * c, 0, -n * c, i * c, 0, (n + 1) * c);
      pts.push(-n * c, 0, i * c, (n + 1) * c, 0, i * c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffd400, fog: false }));
    grid.frustumCulled = false;
    return grid;
  }
}
