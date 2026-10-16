import * as THREE from 'three';
import { COMBAT } from '../../config/combat';
import { BEAM_VISUAL as V, FIRE } from '../../config/effects';
import type { Kaiju } from '../../entities/kaiju/Kaiju';
import type { DustSystem } from './DustSystem';

const _origin = new THREE.Vector3();
const _end = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** HDR colors (values > 1 feed the bloom pass). */
const CORE = new THREE.Color(0xd8fbff).multiplyScalar(3);
const GLOW = new THREE.Color(0x3fc8ff).multiplyScalar(1.4);

/**
 * Beam visuals for one kaiju: charge orb at the mouth, a two-layer energy
 * column (hot core + soft scrolling sheath) to the impact point, a flare at
 * the impact and fire bursts. Visual only; damage is resolved in CombatSystem.
 */
export class BeamFx {
  private readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly sheath: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly mouthFlare: THREE.Sprite;
  private readonly impactFlare: THREE.Sprite;
  private fireTimer = 0;
  private time = 0;

  constructor(scene: THREE.Scene, private readonly fire: DustSystem) {
    // Unit cylinders along +Y from 0 to 1; scaled to the beam length each frame.
    const geo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0);
    this.core = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: CORE, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
    );
    this.sheath = new THREE.Mesh(geo, this.sheathMaterial());
    const flareTex = radialTexture();
    const flare = () =>
      new THREE.Sprite(
        new THREE.SpriteMaterial({ map: flareTex, color: GLOW, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
      );
    this.mouthFlare = flare();
    this.impactFlare = flare();
    for (const o of [this.core, this.sheath, this.mouthFlare, this.impactFlare]) {
      o.frustumCulled = false;
      o.renderOrder = 20;
      this.group.add(o);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  /** True while anything bright is on screen (drives the bloom pass). */
  get glowing(): boolean {
    return this.group.visible;
  }

  update(kaiju: Kaiju, dt: number): void {
    this.time += dt;
    const c = kaiju.combat;
    const state = kaiju.state;
    const charging = state === 'beamCharge';
    const firing = c.isBeamFiring;
    this.group.visible = charging || state === 'beamFire';
    if (!this.group.visible) return;

    kaiju.model.mouth.getWorldPosition(_origin);
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 47) + 0.1 * Math.sin(this.time * 13);

    // Mouth glow grows with charge, peaks while firing.
    const charge = charging ? c.charge : c.action.charge;
    this.mouthFlare.position.copy(_origin);
    this.mouthFlare.scale.setScalar((V.mouthFlareMin + (V.mouthFlareMax - V.mouthFlareMin) * charge) * pulse * kaiju.scale);

    this.core.visible = this.sheath.visible = this.impactFlare.visible = firing;
    if (!firing) return;

    if (c.beamEnd.hit) _end.set(c.beamEnd.x, c.beamEnd.y, c.beamEnd.z);
    else _end.set(c.beamDir.x, c.beamDir.y, c.beamDir.z).multiplyScalar(COMBAT.beam.range).add(_origin);
    _dir.subVectors(_end, _origin);
    const len = _dir.length();
    _q.setFromUnitVectors(UP, _dir.normalize());
    const w = kaiju.scale * pulse;
    for (const [mesh, radius] of [[this.core, V.coreRadius], [this.sheath, V.glowRadius]] as const) {
      mesh.position.copy(_origin);
      mesh.quaternion.copy(_q);
      mesh.scale.set(radius * w, len, radius * w);
    }
    this.sheath.material.uniforms['uTime']!.value = this.time;
    this.sheath.material.uniforms['uLength']!.value = len;

    this.impactFlare.visible = c.beamEnd.hit;
    if (c.beamEnd.hit) {
      this.impactFlare.position.copy(_end);
      this.impactFlare.scale.setScalar(V.impactFlareSize * pulse);
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = FIRE.interval;
        this.fire.burst(_end.x, _end.y, _end.z, FIRE.beamImpact, 1);
      }
    }
  }

  private sheathMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: GLOW }, uTime: { value: 0 }, uLength: { value: 100 } },
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
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uLength;
        varying vec2 vUv;
        varying float vFacing;
        void main() {
          // Soft edges (fresnel) with energy bands racing away from the mouth.
          float edge = pow(vFacing, 1.6);
          float bands = 0.65 + 0.35 * sin(vUv.y * uLength * 0.08 - uTime * 60.0);
          float fadeEnds = smoothstep(0.0, 0.02, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
          gl_FragColor = vec4(uColor * edge * bands * fadeEnds, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
}

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
