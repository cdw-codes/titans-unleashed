import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { POSTFX } from '../config/postfx';
import { CAMERA } from '../config/camera';
import { ENVIRONMENT } from '../config/environment';
import type { QualityPreset } from '../config/quality';

/**
 * Owns the WebGL renderer, scene and main camera; applies quality presets.
 * Bloom (EffectComposer) is used only on frames that ask for it (beam glow),
 * so its full-screen passes cost nothing the rest of the time.
 */
export class RenderSystem {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private preset: QualityPreset;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;

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

  /** `bloom`: run the post-processing chain this frame (if the preset allows it). */
  render(bloom = false): void {
    if (bloom && this.preset.postProcessing) {
      this.ensureComposer().render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Compile the render-target shader variants up front so the first beam doesn't hitch. */
  prewarmPostFx(): void {
    if (this.preset.postProcessing) this.ensureComposer().render();
  }

  private ensureComposer(): EffectComposer {
    if (this.composer) return this.composer;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: this.preset.antialias ? 4 : 0,
    });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      size.clone().multiplyScalar(POSTFX.bloomResolutionScale),
      POSTFX.bloomStrength,
      POSTFX.bloomRadius,
      POSTFX.bloomThreshold,
    );
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.resizeComposer();
    return composer;
  }

  private resizeComposer(): void {
    if (!this.composer || !this.bloom) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.bloom.resolution.copy(size.multiplyScalar(POSTFX.bloomResolutionScale));
    this.bloom.strength = POSTFX.bloomStrength;
    this.bloom.radius = POSTFX.bloomRadius;
    this.bloom.threshold = POSTFX.bloomThreshold;
  }

  private readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.preset.maxPixelRatio));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.resizeComposer();
  };
}
