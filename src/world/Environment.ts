import * as THREE from 'three';
import { ENVIRONMENT as ENV } from '../config/environment';
import type { QualityPreset } from '../config/quality';
import { snapToTexelGrid } from './shadowSnap';

const SUN_DISTANCE = 1500;

/**
 * Sky dome, sun (the only shadow caster), hemisphere fill, and distance fog.
 * The shadow frustum follows the player and is texel-snapped to avoid shimmer.
 */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly mountains: THREE.Mesh;
  private time = 0;
  private readonly fog: THREE.Fog;
  private readonly sunDir = new THREE.Vector3();
  private readonly lightRight = new THREE.Vector3();
  private readonly lightUp = new THREE.Vector3();
  private readonly snapped = new THREE.Vector3();
  private texelSize = 1;

  constructor(scene: THREE.Scene, preset: QualityPreset) {
    this.fog = new THREE.Fog(ENV.fogColor, 100, 1000);
    scene.fog = this.fog;
    scene.background = new THREE.Color(ENV.skyHorizon);

    this.hemi = new THREE.HemisphereLight(ENV.hemiSky, ENV.hemiGround, ENV.hemiIntensity);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(ENV.sunColor, ENV.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun, this.sun.target);

    this.sky = this.createSky();
    this.mountains = createMountains();
    scene.add(this.sky, this.mountains);

    this.setSunAngles(ENV.sunElevation, ENV.sunAzimuth);
    this.applyQuality(preset);
  }

  setSunAngles(elevationDeg: number, azimuthDeg: number): void {
    const el = THREE.MathUtils.degToRad(elevationDeg);
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    this.sky?.material.uniforms['sunDir']!.value.copy(this.sunDir);
    // Light-space basis for texel snapping (light looks along -sunDir).
    this.lightRight.crossVectors(THREE.Object3D.DEFAULT_UP, this.sunDir).normalize();
    this.lightUp.crossVectors(this.sunDir, this.lightRight).normalize();
  }

  applyQuality(preset: QualityPreset): void {
    const cam = this.sun.shadow.camera;
    const e = preset.shadowExtent;
    cam.left = -e;
    cam.right = e;
    cam.top = e;
    cam.bottom = -e;
    cam.near = 10;
    cam.far = SUN_DISTANCE * 2;
    cam.updateProjectionMatrix();
    this.sun.castShadow = preset.shadows;
    if (this.sun.shadow.mapSize.x !== preset.shadowMapSize) {
      this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.texelSize = (2 * e) / preset.shadowMapSize;
    this.sun.shadow.normalBias = this.texelSize * 1.5;

    this.fog.near = preset.drawDistance * preset.fogStart;
    this.fog.far = preset.drawDistance * 0.95;
    const r = preset.drawDistance * 0.9;
    this.sky.scale.setScalar(r);
    // Just inside the far plane, beyond the fog-hidden edge of the streamed world.
    this.mountains.scale.setScalar(preset.drawDistance * 0.93);
  }

  /** Call every render frame with the interpolated player position. */
  follow(focus: THREE.Vector3, cameraPosition: THREE.Vector3, dt = 0): void {
    this.time += dt;
    this.sky.material.uniforms['time']!.value = this.time;
    this.mountains.position.set(cameraPosition.x, focus.y - 60, cameraPosition.z);
    snapToTexelGrid(focus, this.lightRight, this.lightUp, this.texelSize, this.snapped);
    this.sun.target.position.copy(this.snapped);
    this.sun.position.copy(this.snapped).addScaledVector(this.sunDir, SUN_DISTANCE);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(cameraPosition);
  }

  private createSky(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: new THREE.Color(ENV.skyZenith) },
        horizon: { value: new THREE.Color(ENV.skyHorizon) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(ENV.sunColor) },
        time: { value: 0 },
        cover: { value: ENV.cloudCover },
        speed: { value: ENV.cloudSpeed },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // pin to the far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform float time;
        uniform float cover;
        uniform float speed;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float s = 0.0;
          float a = 0.55;
          for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
          return s;
        }
        void main() {
          vec3 d = normalize(vDir);
          float t = pow(clamp(d.y, 0.0, 1.0), 0.5);
          vec3 col = mix(horizon, zenith, t);
          // Warm glow around the sun.
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(sd, 12.0) * 0.18 + pow(sd, 400.0) * 0.6);
          // Soft cloud layer projected onto a dome; thins out toward the horizon.
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.18) * 1.6 + vec2(time * speed, time * speed * 0.4);
            float n = fbm(uv);
            float c = smoothstep(1.0 - cover, 1.0 - cover + 0.32, n) * smoothstep(0.0, 0.25, d.y);
            vec3 cloud = mix(vec3(0.93, 0.93, 0.96), sunColor, 0.15) - vec3(0.12, 0.1, 0.06) * smoothstep(0.5, 1.0, n);
            col = mix(col, cloud, c * 0.85);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    return sky;
  }
}

/**
 * Two rings of low-poly mountain silhouettes around the horizon (unit radius,
 * scaled to the draw distance), tinted toward the sky like distant haze. They
 * follow the camera, so they read as infinitely far away.
 */
function createMountains(): THREE.Mesh {
  const segs = 360;
  const pos: number[] = [];
  const col: number[] = [];
  const ring = (radius: number, height: number, hex: number, seed: number) => {
    const c = new THREE.Color(hex);
    const top = c.clone().lerp(new THREE.Color(ENV.skyHorizon), 0.15);
    const base = c.clone().lerp(new THREE.Color(ENV.fogColor), 0.7);
    for (let i = 0; i < segs; i++) {
      const peak = (k: number) => {
        const a = (k / segs) * Math.PI * 2 + seed;
        // Layered sines give ridges with a few taller peaks.
        const n = 0.5 + 0.22 * Math.sin(a * 3 + seed) + 0.14 * Math.sin(a * 11 + seed * 2) + 0.1 * Math.abs(Math.sin(a * 29 + seed * 5)) + 0.05 * Math.sin(a * 67 + seed);
        return Math.max(0.05, n * n) * height;
      };
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const x0 = Math.sin(a0) * radius;
      const z0 = Math.cos(a0) * radius;
      const x1 = Math.sin(a1) * radius;
      const z1 = Math.cos(a1) * radius;
      const h0 = peak(i);
      const h1 = peak(i + 1);
      // Quad from below the horizon up to the ridge line (facing the center).
      pos.push(x0, -0.15, z0, x1, h1, z1, x0, h0, z0, x0, -0.15, z0, x1, -0.15, z1, x1, h1, z1);
      for (const k of [base, top, top, base, base, top]) col.push(k.r, k.g, k.b);
    }
  };
  ring(1, (ENV.mountainHeight / 2600) * 1.0, ENV.mountainFar, 0.7);
  ring(0.94, (ENV.mountainHeight / 2600) * 0.7, ENV.mountainNear, 2.9);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -0.5;
  return mesh;
}
