import * as THREE from 'three';
import { CAMERA } from '../config/camera';
import { ENVIRONMENT } from '../config/environment';
import type { QualityPreset } from '../config/quality';

/** Owns the WebGL renderer, scene and main camera; applies quality presets. */
export class RenderSystem {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private preset: QualityPreset;

  constructor(container: HTMLElement, preset: QualityPreset) {
    this.preset = preset;
    this.renderer = new THREE.WebGLRenderer({
      antialias: preset.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = ENVIRONMENT.exposure;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, preset.drawDistance);
    this.applyQuality(preset);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get antialias(): boolean {
    return this.preset.antialias;
  }

  applyQuality(preset: QualityPreset): void {
    this.preset = preset;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.maxPixelRatio));
    this.renderer.shadowMap.enabled = preset.shadows;
    this.camera.far = preset.drawDistance;
    this.camera.updateProjectionMatrix();
    // Materials compiled with/without shadows must recompile.
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.needsUpdate = true;
      }
    });
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.preset.maxPixelRatio));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
