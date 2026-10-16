import * as THREE from 'three';

/**
 * Energy barrier around the arena: a tall open cylinder with a scrolling hex
 * lattice that fades upward, rising out of the ground and dropping away.
 * Kept below HDR brightness so it never triggers bloom by itself.
 */
export class BarrierFx {
  private readonly mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private rise = 0;
  private target = 0;
  private time = 0;

  constructor(scene: THREE.Scene, private readonly height: number) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true).translate(0, 0.5, 0);
    this.mesh = new THREE.Mesh(geo, this.material());
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    scene.add(this.mesh);
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  raise(x: number, z: number, radius: number): void {
    this.mesh.position.set(x, 0, z);
    this.mesh.scale.set(radius, this.height, radius);
    this.mesh.material.uniforms['uRadius']!.value = radius;
    this.target = 1;
    this.mesh.visible = true;
  }

  drop(): void {
    this.target = 0;
  }

  /** Brief brightening where something hits the wall. */
  flash(): void {
    this.mesh.material.uniforms['uFlash']!.value = 1;
  }

  update(dt: number): void {
    this.time += dt;
    this.rise += (this.target - this.rise) * Math.min(1, dt * (this.target > this.rise ? 1.6 : 1.2));
    if (this.target === 0 && this.rise < 0.01) this.mesh.visible = false;
    const u = this.mesh.material.uniforms;
    u['uTime']!.value = this.time;
    u['uRise']!.value = this.rise;
    u['uFlash']!.value = Math.max(0, u['uFlash']!.value - dt * 2);
  }

  private material(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRise: { value: 0 },
        uFlash: { value: 0 },
        uRadius: { value: 380 },
        uColor: { value: new THREE.Color(0x6fd6ff) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFacing;
        void main() {
          vUv = uv;
          vec3 n = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vFacing = abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uRise;
        uniform float uFlash;
        uniform float uRadius;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vFacing;
        // Distance to the nearest hex cell edge (0 at edges).
        float hex(vec2 p) {
          p.x *= 1.1547;
          p.y += mod(floor(p.x), 2.0) * 0.5;
          p = abs(fract(p) - 0.5);
          return abs(max(p.x * 1.5 + p.y, p.y * 2.0) - 1.0);
        }
        void main() {
          // Hex cells ~25 m wide regardless of radius.
          vec2 p = vec2(vUv.x * 6.2832 * uRadius / 25.0, vUv.y * 420.0 / 25.0 - uTime * 0.6);
          float lines = 1.0 - smoothstep(0.0, 0.08, hex(p));
          float h = vUv.y / max(uRise, 0.001);
          if (h > 1.0) discard;
          float fade = (1.0 - h) * (1.0 - h);
          float base = smoothstep(0.0, 0.03, vUv.y) * 0.6 + 0.4;
          float sweep = 0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * 3.0);
          float edge = pow(1.0 - vFacing, 2.0);
          float a = (lines * (0.55 + 0.25 * sweep) + 0.08 + edge * 0.35) * fade * base * uRise;
          a *= 1.0 + uFlash * 1.5;
          gl_FragColor = vec4(uColor * a * 0.9, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
  }
}
