import * as THREE from 'three';
import type { DustBurstConfig } from '../../config/effects';

/** What a particle system needs from its config (dust and smoke share the system). */
export interface ParticleConfig {
  readonly capacity: number;
  readonly color: number;
  readonly drag: number;
  /** Additive blending (fire, sparks) instead of normal alpha (dust, smoke). */
  readonly additive?: boolean;
  /** Color multiplier; > 1 pushes additive particles into bloom. */
  readonly brightness?: number;
  /** Downward acceleration (m/s²), e.g. water spray; 0 = floats. */
  readonly gravity?: number;
}

/**
 * Pooled soft dust puffs: one InstancedMesh of camera-facing quads, one draw call.
 * Visual only, so it advances at render rate with the (scaled, pausable) frame delta.
 */
export class DustSystem {
  readonly mesh: THREE.Mesh;
  private readonly cap: number;
  private live = 0;
  // Per-particle sim state (structure of arrays).
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly rot: Float32Array;
  // GPU attributes.
  private readonly aOffset: THREE.InstancedBufferAttribute;
  private readonly aParams: THREE.InstancedBufferAttribute; // size, alpha, rotation, seed
  private readonly geometry: THREE.InstancedBufferGeometry;

  constructor(private readonly cfg: ParticleConfig) {
    const n = (this.cap = cfg.capacity);
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.size1 = new Float32Array(n);
    this.alpha0 = new Float32Array(n);
    this.rot = new Float32Array(n);

    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.attributes['position']!);
    this.geometry.setAttribute('uv', quad.attributes['uv']!);
    this.aOffset = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aParams = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aOffset', this.aOffset);
    this.geometry.setAttribute('aParams', this.aParams);
    this.geometry.instanceCount = 0;

    this.mesh = new THREE.Mesh(this.geometry, this.createMaterial());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  burst(x: number, y: number, z: number, b: DustBurstConfig, scale = 1): void {
    for (let i = 0; i < b.count; i++) {
      const a = (i / b.count) * Math.PI * 2 + Math.random() * 0.5;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const speed = (b.speedMin + Math.random() * (b.speedMax - b.speedMin)) * scale;
      this.spawn(
        x + ca * b.ringRadius * scale,
        y + 1 + Math.random() * 2,
        z + sa * b.ringRadius * scale,
        ca * speed,
        (b.riseMin + Math.random() * (b.riseMax - b.riseMin)) * scale,
        sa * speed,
        b.lifeMin + Math.random() * (b.lifeMax - b.lifeMin),
        b.sizeStart * scale * (0.7 + Math.random() * 0.6),
        b.sizeEnd * scale * (0.7 + Math.random() * 0.6),
        b.opacity,
      );
    }
  }

  update(dt: number): void {
    if (dt <= 0 && this.live === 0) return;
    const drag = Math.pow(this.cfg.drag, dt);
    const fall = (this.cfg.gravity ?? 0) * dt;
    let i = 0;
    while (i < this.live) {
      this.age[i]! += dt;
      if (this.age[i]! >= this.life[i]!) {
        this.swapRemove(i);
        continue;
      }
      const o = i * 3;
      this.vel[o]! *= drag;
      this.vel[o + 1]! = this.vel[o + 1]! * drag - fall;
      this.vel[o + 2]! *= drag;
      this.pos[o]! += this.vel[o]! * dt;
      this.pos[o + 1]! += this.vel[o + 1]! * dt;
      this.pos[o + 2]! += this.vel[o + 2]! * dt;
      i++;
    }
    this.upload();
  }

  get count(): number {
    return this.live;
  }

  private spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, s0: number, s1: number, alpha: number,
  ): void {
    // Pool full: recycle slot 0 (roughly the oldest after swap-removes).
    const i = this.live < this.cap ? this.live++ : 0;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.size0[i] = s0;
    this.size1[i] = s1;
    this.alpha0[i] = alpha;
    this.rot[i] = Math.random() * Math.PI * 2;
  }

  private swapRemove(i: number): void {
    const last = --this.live;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.age[i] = this.age[last]!;
    this.life[i] = this.life[last]!;
    this.size0[i] = this.size0[last]!;
    this.size1[i] = this.size1[last]!;
    this.alpha0[i] = this.alpha0[last]!;
    this.rot[i] = this.rot[last]!;
  }

  private upload(): void {
    const off = this.aOffset.array as Float32Array;
    const par = this.aParams.array as Float32Array;
    for (let i = 0; i < this.live; i++) {
      const t = this.age[i]! / this.life[i]!;
      const ease = 1 - (1 - t) * (1 - t); // fast growth, slow finish
      off[i * 3] = this.pos[i * 3]!;
      off[i * 3 + 1] = this.pos[i * 3 + 1]!;
      off[i * 3 + 2] = this.pos[i * 3 + 2]!;
      par[i * 4] = this.size0[i]! + (this.size1[i]! - this.size0[i]!) * ease;
      // Quick fade in, long fade out.
      par[i * 4 + 1] = this.alpha0[i]! * Math.min(1, t * 8) * (1 - t) * (1 - t);
      par[i * 4 + 2] = this.rot[i]! + t * 0.6;
      par[i * 4 + 3] = (i * 0.618) % 1;
    }
    this.geometry.instanceCount = this.live;
    this.aOffset.needsUpdate = true;
    this.aParams.needsUpdate = true;
    this.aOffset.addUpdateRange(0, this.live * 3);
    this.aParams.addUpdateRange(0, this.live * 4);
  }

  private createMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uColor: { value: new THREE.Color(this.cfg.color).multiplyScalar(this.cfg.brightness ?? 1) } },
      ]),
      vertexShader: /* glsl */ `
        attribute vec3 aOffset;
        attribute vec4 aParams;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vSeed;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vAlpha = aParams.y;
          vSeed = aParams.w;
          float c = cos(aParams.z), s = sin(aParams.z);
          vec2 corner = mat2(c, s, -s, c) * position.xy * aParams.x;
          vec4 mvPosition = viewMatrix * vec4(aOffset, 1.0);
          mvPosition.xy += corner; // billboard in view space
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vSeed;
        #include <fog_pars_fragment>
        void main() {
          vec2 p = vUv - 0.5;
          float d = length(p) * 2.0;
          // Lumpy soft blob: radial falloff broken up by a couple of cheap lobes.
          float lobes = 0.85 + 0.15 * sin(atan(p.y, p.x) * 5.0 + vSeed * 6.283);
          float a = smoothstep(1.0, 0.25, d / lobes) * vAlpha;
          if (a < 0.004) discard;
          // Darker underside reads as volume.
          vec3 col = uColor * (0.8 + 0.35 * vUv.y);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: this.cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }
}
