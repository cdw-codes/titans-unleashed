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
    scene.add(this.sky);

    this.setSunAngles(ENV.sunElevation, ENV.sunAzimuth);
    this.applyQuality(preset);
  }

  setSunAngles(elevationDeg: number, azimuthDeg: number): void {
    const el = THREE.MathUtils.degToRad(elevationDeg);
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
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
  }

  /** Call every render frame with the interpolated player position. */
  follow(focus: THREE.Vector3, cameraPosition: THREE.Vector3): void {
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
        varying vec3 vDir;
        void main() {
          float t = pow(clamp(vDir.y, 0.0, 1.0), 0.55);
          gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);
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
