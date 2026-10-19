import * as THREE from 'three';
import { ENVIRONMENT as ENV } from '../config/environment';
import { WATER_FX } from '../config/effects';
import { terrain } from './terrain/Terrain';

/** Meters per ripple tile (the plane snaps to whole tiles as it follows the player). */
const TILE = 150;

/**
 * One water plane at the terrain's water level, following the player: the
 * terrain hides it except where the ground dips below (sea, lakes). Two ripple
 * layers drift against each other (no visible tiling); the surface is partly
 * see-through looking down, so the sandy shelf reads as bright shallows and wading
 * legs show dimly, and turns into a sky-tinted mirror at grazing angles (fresnel).
 */
export class Water {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhongMaterial>;
  private readonly normals: THREE.CanvasTexture;
  private time = 0;
  private readonly uTime = { value: 0 };

  /** `anisotropy`: texture filtering samples; keeps the ripples crisp toward the horizon. */
  constructor(scene: THREE.Scene, drawDistance: number, anisotropy = 1) {
    const size = drawDistance * 2.4;
    this.normals = rippleNormals();
    this.normals.anisotropy = anisotropy;
    this.normals.repeat.set(size / TILE, size / TILE);
    const geo = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshPhongMaterial({
        color: ENV.waterColor,
        specular: 0x9fb4c8,
        shininess: 60,
        normalMap: this.normals,
        normalScale: new THREE.Vector2(0.25, 0.25),
        transparent: true,
        opacity: WATER_FX.surfaceOpacity,
      }),
    );
    const uniforms = {
      uTime: this.uTime,
      uSky: { value: new THREE.Color(ENV.fogColor) },
      uFresnel: { value: WATER_FX.fresnel },
    };
    this.mesh.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uSky;\nuniform float uFresnel;')
        .replace(
          'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
          // A second, larger layer drifting the other way breaks up the tiling.
          `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          vec3 mapN2 = texture2D( normalMap, mat2( 0.8, 0.6, -0.6, 0.8 ) * vNormalMapUv * 0.29 + vec2( -uTime * 0.0031, uTime * 0.0047 ) ).xyz * 2.0 - 1.0;
          mapN = normalize( vec3( mapN.xy * 0.7 + mapN2.xy, mapN.z * mapN2.z ) );`,
        )
        .replace(
          '#include <opaque_fragment>',
          `float fres = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 5.0 );
          outgoingLight = mix( outgoingLight, uSky, fres * uFresnel );
          diffuseColor.a = mix( diffuseColor.a, 1.0, min( 1.0, fres * 2.0 ) );
          #include <opaque_fragment>`,
        );
    };
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.mesh.position.y = terrain.waterLevel;
    scene.add(this.mesh);
  }

  /** Call every render frame. */
  follow(focus: THREE.Vector3, dt: number): void {
    // Snap to whole ripple tiles so the pattern doesn't slide with the player.
    this.mesh.position.x = Math.round(focus.x / TILE) * TILE;
    this.mesh.position.z = Math.round(focus.z / TILE) * TILE;
    this.time += dt;
    this.normals.offset.set(this.time * 0.004, this.time * 0.0025);
    this.uTime.value = this.time;
  }
}

/**
 * Wind chop as a tangent-space normal map: a sum of waves in scattered directions
 * with integer frequencies (so the tile wraps seamlessly), longer waves stronger.
 * Fixed seed: the same sea every load.
 */
function rippleNormals(): THREE.CanvasTexture {
  const n = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const waves: [number, number, number, number][] = [];
  while (waves.length < 18) {
    const kx = Math.round((rand() * 2 - 1) * 9);
    const ky = Math.round((rand() * 2 - 1) * 9);
    const k = Math.hypot(kx, ky);
    if (k < 2) continue;
    waves.push([kx, ky, rand() * Math.PI * 2, 1 / k ** 1.2]);
  }
  const h = (x: number, y: number) => {
    let sum = 0;
    for (const [kx, ky, ph, amp] of waves) sum += Math.sin(((kx * x + ky * y) / n) * Math.PI * 2 + ph) * amp;
    return sum;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 7;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 7;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * n + x) * 4;
      img.data[o] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[o + 1] = (-dy / len * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
