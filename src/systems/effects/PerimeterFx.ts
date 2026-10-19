import * as THREE from 'three';

/**
 * The edge of a city map's data, made visible: four tall translucent walls along
 * the playable rectangle with a scrolling scan grid. Each fragment fades in by its
 * distance to the player, so the wall only shows where you are about to meet it.
 * One draw call; nothing renders while the player is far from every edge.
 */
export class PerimeterFx {
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly uniforms = {
    uTime: { value: 0 },
    uPlayer: { value: new THREE.Vector3() },
    uNear: { value: 650 },
    uColor: { value: new THREE.Color(0x6fd6ff) },
  };
  private readonly box: { minX: number; minZ: number; maxX: number; maxZ: number };

  constructor(scene: THREE.Scene, minX: number, minZ: number, maxX: number, maxZ: number, height = 420, base = -60) {
    this.box = { minX, minZ, maxX, maxZ };
    const corners: [number, number][] = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
    const pos: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = corners[i]!;
      const [x1, z1] = corners[(i + 1) % 4]!;
      const len = Math.hypot(x1 - x0, z1 - z0);
      // Two triangles per wall; uv.x in meters along the wall, uv.y 0..1 up.
      pos.push(x0, base, z0, x1, base, z1, x1, base + height, z1, x0, base, z0, x1, base + height, z1, x0, base + height, z0);
      uv.push(0, 0, len, 0, len, 1, 0, 0, len, 1, 0, 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vWorld;
          void main() {
            vUv = uv;
            vWorld = position;
            gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uPlayer;
          uniform float uNear;
          uniform vec3 uColor;
          varying vec2 vUv;
          varying vec3 vWorld;
          void main() {
            float d = distance(vWorld.xz, uPlayer.xz);
            float near = smoothstep(uNear, uNear * 0.25, d);
            if (near < 0.01) discard;
            // Scan grid: vertical posts every 40 m, horizontal bands drifting up.
            float posts = smoothstep(0.92, 1.0, abs(fract(vUv.x / 40.0) * 2.0 - 1.0));
            float bands = smoothstep(0.85, 1.0, abs(fract(vUv.y * 9.0 - uTime * 0.25) * 2.0 - 1.0));
            float fill = 0.10 + 0.08 * sin(vUv.x * 0.05 + uTime * 1.3);
            float fade = smoothstep(1.0, 0.25, vUv.y) * smoothstep(0.0, 0.08, vUv.y);
            float a = (fill + posts * 0.55 + bands * 0.35) * fade * near;
            gl_FragColor = vec4(uColor, a);
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    scene.add(this.mesh);
  }

  /** Meters from (x, z) to the nearest edge (0 at or beyond it). */
  distanceToEdge(x: number, z: number): number {
    const b = this.box;
    return Math.max(0, Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z));
  }

  get bounds(): Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }> {
    return this.box;
  }

  update(player: THREE.Vector3, dt: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uPlayer.value.copy(player);
    this.mesh.visible = this.distanceToEdge(player.x, player.z) < this.uniforms.uNear.value;
  }
}
