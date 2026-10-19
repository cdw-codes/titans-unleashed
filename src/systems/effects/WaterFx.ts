import * as THREE from 'three';
import { WATER_FX as W } from '../../config/effects';
import type { Titan } from '../../entities/titan/Titan';
import { terrain } from '../../world/terrain/Terrain';
import { DustSystem } from './DustSystem';

/**
 * Foam rings on the water surface: pooled flat quads, one draw call. Each ring
 * expands with an ease-out and fades; the shader draws a broken foam crest with a
 * faint churned fill inside.
 */
class Ripples {
  readonly mesh: THREE.Mesh;
  private readonly x: Float32Array;
  private readonly z: Float32Array;
  private readonly radius: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly alpha: Float32Array;
  private readonly aData: THREE.InstancedBufferAttribute; // x, z, radius, alpha
  private readonly aSeed: THREE.InstancedBufferAttribute;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private live = 0;

  constructor(private readonly cap: number) {
    this.x = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.radius = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.attributes['position']!);
    this.geometry.setAttribute('uv', quad.attributes['uv']!);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSeed = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aData', this.aData);
    this.geometry.setAttribute('aSeed', this.aSeed);
    this.geometry.instanceCount = 0;
    this.mesh = new THREE.Mesh(
      this.geometry,
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          { uColor: { value: new THREE.Color(W.rippleColor) }, uY: { value: terrain.waterLevel + 0.25 } },
        ]),
        vertexShader: /* glsl */ `
          attribute vec4 aData;
          attribute float aSeed;
          uniform float uY;
          varying vec2 vUv;
          varying float vAlpha;
          varying float vSeed;
          #include <fog_pars_vertex>
          void main() {
            vUv = uv;
            vAlpha = aData.w;
            vSeed = aSeed;
            vec3 p = vec3(aData.x + position.x * aData.z, uY, aData.y + position.z * aData.z);
            vec4 mvPosition = viewMatrix * vec4(p, 1.0);
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
            vec2 p = vUv * 2.0 - 1.0;
            float d = length(p);
            if (d > 1.0) discard;
            float ang = atan(p.y, p.x);
            // Broken crest: thickness and presence wobble around the ring.
            float wob = 0.5 + 0.5 * sin(ang * 9.0 + vSeed * 40.0) * sin(ang * 4.0 - vSeed * 17.0);
            float crest = smoothstep(0.80 - 0.08 * wob, 0.93, d) * smoothstep(1.0, 0.94, d);
            float churn = (1.0 - d) * 0.22 * (0.6 + 0.4 * sin(ang * 13.0 + d * 20.0 + vSeed * 9.0));
            float a = (crest * (0.55 + 0.45 * wob) + churn) * vAlpha;
            if (a < 0.01) discard;
            gl_FragColor = vec4(uColor, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  spawn(x: number, z: number, radius: number, seconds: number, alpha = W.rippleOpacity): void {
    const i = this.live < this.cap ? this.live++ : 0;
    this.x[i] = x;
    this.z[i] = z;
    this.radius[i] = radius;
    this.age[i] = 0;
    this.life[i] = seconds;
    this.alpha[i] = alpha;
    (this.aSeed.array as Float32Array)[i] = Math.random();
  }

  update(dt: number): void {
    const data = this.aData.array as Float32Array;
    const seed = this.aSeed.array as Float32Array;
    let i = 0;
    while (i < this.live) {
      this.age[i]! += dt;
      if (this.age[i]! >= this.life[i]!) {
        const last = --this.live;
        if (i !== last) {
          this.x[i] = this.x[last]!;
          this.z[i] = this.z[last]!;
          this.radius[i] = this.radius[last]!;
          this.age[i] = this.age[last]!;
          this.life[i] = this.life[last]!;
          this.alpha[i] = this.alpha[last]!;
          seed[i] = seed[last]!;
        }
        continue;
      }
      const t = this.age[i]! / this.life[i]!;
      const grow = 1 - (1 - t) ** 3;
      data[i * 4] = this.x[i]!;
      data[i * 4 + 1] = this.z[i]!;
      data[i * 4 + 2] = Math.max(0.5, this.radius[i]! * (0.15 + 0.85 * grow));
      data[i * 4 + 3] = this.alpha[i]! * Math.min(1, t * 10) * (1 - t);
      i++;
    }
    this.geometry.instanceCount = this.live;
    this.aData.needsUpdate = true;
    this.aSeed.needsUpdate = true;
    this.aData.addUpdateRange(0, this.live * 4);
    this.aSeed.addUpdateRange(0, this.live);
  }

  get count(): number {
    return this.live;
  }
}

interface WadeState {
  wake: number;
  collar: number;
}

/**
 * Titans in water: splashes and foam rings for steps in the shallows, a waterline
 * collar and a wake while wading, big slams for ground attacks, steam where a
 * beam cuts the surface. Visual only, at render rate. 3 draw calls (spray, mist, rings).
 */
export class WaterFx {
  private readonly spray = new DustSystem({ capacity: W.sprayCapacity, color: W.sprayColor, drag: W.sprayDrag, gravity: W.sprayGravity });
  private readonly mist = new DustSystem({ capacity: W.mistCapacity, color: W.mistColor, drag: W.mistDrag });
  private readonly ripples = new Ripples(W.rippleCapacity);
  private readonly wading = new WeakMap<Titan, WadeState>();
  private steamTimer = 0;
  private sinceSteam = Infinity;

  constructor(scene: THREE.Scene) {
    scene.add(this.spray.mesh, this.mist.mesh, this.ripples.mesh);
  }

  /** Water depth (m) at a point; 0 when dry or too shallow to splash. */
  depthAt(x: number, z: number): number {
    const d = terrain.waterLevel - terrain.heightAt(x, z);
    return d > W.minDepth ? d : 0;
  }

  get count(): number {
    return this.spray.count + this.mist.count + this.ripples.count;
  }

  /** A foot coming down in water: crown of spray, a little mist, a foam ring. Deeper = bigger. */
  footstep(x: number, z: number, depth: number, scale: number, sprinting: boolean): void {
    const y = terrain.waterLevel;
    const k = scale * Math.min(1.4, 0.55 + depth / 25) * (sprinting ? 1.25 : 1);
    this.spray.burst(x, y, z, W.stepSpray, k);
    this.mist.burst(x, y, z, W.stepMist, k);
    this.ripples.spawn(x, z, W.stepRipple * k, W.stepRippleSeconds);
  }

  /** Stomp, pulse, tail sweep or a body hitting the water. */
  slam(x: number, z: number, radius: number): void {
    const y = terrain.waterLevel;
    const k = Math.min(2.5, radius / 60);
    this.spray.burst(x, y, z, W.slamSpray, k);
    this.mist.burst(x, y, z, W.slamMist, k);
    this.ripples.spawn(x, z, radius * W.slamRippleScale, W.slamRippleSeconds);
    this.ripples.spawn(x, z, radius * W.slamRippleScale * 0.6, W.slamRippleSeconds * 0.8);
  }

  /** A roar flattens the water into one wide ring. */
  roar(x: number, z: number, radius: number): void {
    if (this.depthAt(x, z) > 0) this.ripples.spawn(x, z, radius, W.slamRippleSeconds * 1.4, W.rippleOpacity * 0.6);
  }

  /** Per frame for each titan: waterline foam collar, wake rings and bow spray while wading. */
  wade(t: Titan, dt: number): void {
    if (!t.model.object.visible || t.sink > 0) return;
    const p = t.renderPosition;
    const depth = this.depthAt(p.x, p.z);
    if (depth <= 0) return;
    let s = this.wading.get(t);
    if (!s) this.wading.set(t, (s = { wake: 0, collar: Math.random() * W.collarInterval }));
    const r = t.spec.body.capsuleRadius;
    const deep = Math.min(1, depth / 20);
    s.collar -= dt;
    if (s.collar <= 0) {
      s.collar += W.collarInterval;
      this.ripples.spawn(p.x + (Math.random() - 0.5) * r * 0.4, p.z + (Math.random() - 0.5) * r * 0.4, r * W.collarScale, W.collarSeconds, W.rippleOpacity * (0.5 + 0.5 * deep));
    }
    const speed = t.motor.speed;
    if (speed < t.spec.movement.idleSpeed) return;
    s.wake -= dt;
    if (s.wake > 0) return;
    s.wake += W.wakeInterval;
    const k = Math.min(1.6, speed / t.spec.movement.walkSpeed);
    // Rings left where the body was spread into a wake as it moves on.
    this.ripples.spawn(p.x, p.z, W.wakeRipple * t.scale * (0.7 + 0.5 * k), W.wakeRippleSeconds);
    // Bow wave: water shoved up ahead of the shins.
    const fx = p.x + Math.sin(t.yaw) * r * 0.9;
    const fz = p.z + Math.cos(t.yaw) * r * 0.9;
    this.spray.burst(fx, terrain.waterLevel, fz, W.bowSpray, t.scale * k * (0.6 + 0.6 * deep));
  }

  /** A firing beam: steam where it cuts the water surface between mouth and impact. */
  beam(ox: number, oy: number, oz: number, ex: number, ey: number, ez: number, dt: number): void {
    const wl = terrain.waterLevel;
    if (oy <= wl) return;
    // Where the beam meets the surface; far shots end on a ground plane just above it.
    const k = ey < wl ? (oy - wl) / (oy - ey) : ey < wl + 8 ? 1 : -1;
    if (k < 0) return;
    const x = ox + (ex - ox) * k;
    const z = oz + (ez - oz) * k;
    if (this.depthAt(x, z) <= 0) return;
    this.steamTimer -= dt;
    if (this.steamTimer > 0) return;
    this.steamTimer = W.steamInterval;
    this.sinceSteam = 0;
    this.mist.burst(x, wl, z, W.steam, 1);
    this.spray.burst(x, wl, z, W.bowSpray, 1.4);
    if (Math.random() < 0.35) this.ripples.spawn(x, z, 40 + Math.random() * 30, 1.6);
  }

  /** A beam boiled the water within the last moment (steam hiss). */
  get steaming(): boolean {
    return this.sinceSteam < 0.25;
  }

  update(dt: number): void {
    this.sinceSteam += dt;
    this.spray.update(dt);
    this.mist.update(dt);
    this.ripples.update(dt);
  }
}
