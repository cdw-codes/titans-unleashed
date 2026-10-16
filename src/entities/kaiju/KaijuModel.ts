import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp, noise1D, TAU } from '../../core/math';
import { COMBAT } from '../../config/combat';
import type { CombatAction } from './KaijuCombat';

/**
 * Placeholder kaiju built from low-poly primitives, rigidly skinned to a bone
 * hierarchy and merged into ONE SkinnedMesh (one draw call + one shadow call).
 * Animation is procedural for now; Milestone 7 can swap in authored clips on
 * the same kind of skeleton. Proportions here are art, not gameplay tuning.
 */

const COLORS = {
  skin: 0x4a5e4f,
  skinDark: 0x37463b,
  belly: 0x7d7660,
  plate: 0xa8bcc4,
  claw: 0xd9d2bd,
  eye: 0xffffff,
};

type BoneName =
  | 'root' | 'pelvis' | 'spine' | 'chest' | 'neck' | 'head' | 'jaw'
  | 'upperArmL' | 'forearmL' | 'handL' | 'upperArmR' | 'forearmR' | 'handR'
  | 'thighL' | 'shinL' | 'footL' | 'thighR' | 'shinR' | 'footR'
  | `tail${number}`;

/** Height the primitives are authored at; the entity scales the model to KAIJU_BODY.height. */
export const MODEL_DESIGN_HEIGHT = 80;
/** Approximate mouth position in the bind pose (design units), for sim-side beam origins. */
export const MOUTH_DESIGN = { height: 77, forward: 33 };

const TAIL_SEGMENTS = 7;
const TAIL_STEP = new THREE.Vector3(0, -3.8, -9.5);
const TAIL_RADII = [9, 8, 6.8, 5.6, 4.4, 3.2, 2.0, 0.8];

export interface KaijuPoseInput {
  /** Gait phase [0,1): left plant at 0, right at 0.5. */
  phase: number;
  /** Forward speed / walk speed (0 standing, 1 walking, ~2 sprinting). */
  speedRatio: number;
  /** True while the gait is mid-step (including pivots and settling). */
  stepping: boolean;
  sprinting: boolean;
  turnVelocity: number;
  /** Thigh swing amplitude (rad) for the current stride. */
  strideAngle: number;
  time: number;
  dt: number;
  /** Current combat action (attack, beam, reaction); locomotion states are ignored. */
  action: CombatAction;
  /** Beam pitch (rad, + = up) for aiming the head while firing. */
  beamPitch: number;
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const smooth01 = (t: number) => easeInOut(clamp(t, 0, 1));

/**
 * Envelope for a windup/active/recovery move: returns [phase, local progress 0..1].
 * Overlays interpolate between key poses per phase and return to 0 by the end.
 */
function movePhases(t: number, m: { windup: number; active: number; recovery: number }): ['windup' | 'active' | 'recovery' | 'done', number] {
  if (t < m.windup) return ['windup', t / m.windup];
  if (t < m.windup + m.active) return ['active', (t - m.windup) / m.active];
  if (t < m.windup + m.active + m.recovery) return ['recovery', (t - m.windup - m.active) / m.recovery];
  return ['done', 1];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

export class KaijuModel {
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  /** Hip-to-ankle length at design scale, used to derive stride angles. */
  readonly legLength: number;
  readonly glowUniforms = {
    uGlowColor: { value: new THREE.Color(0x58d8ff) },
    uGlowIntensity: { value: 1 },
  };

  /** Follows the snout tip; read its world position for beam visuals. */
  readonly mouth = new THREE.Object3D();
  private readonly bones = new Map<BoneName, THREE.Bone>();
  private readonly bindPos = new Map<BoneName, THREE.Vector3>();
  private readonly parts: THREE.BufferGeometry[] = [];
  private moveBlend = 0;
  private sprintBlend = 0;
  private turnLean = 0;

  constructor() {
    this.buildSkeleton();
    this.buildBody();

    const geometry = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    const material = this.createMaterial();
    this.mesh = new THREE.SkinnedMesh(geometry, material);
    const root = this.bone('root');
    this.mesh.add(root);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton([...this.bones.values()]));
    this.mouth.position.set(0, 0.5, 15);
    this.bone('head').add(this.mouth);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // the player is always in view; avoids per-frame skinned bounds
    this.object.add(this.mesh);

    this.legLength = Math.abs(this.bindPos.get('shinL')!.y + this.bindPos.get('footL')!.y);
  }

  /** Procedural pose from gait + motor state. Call every render frame. */
  pose(p: KaijuPoseInput): void {
    const b = (n: BoneName) => this.bone(n);
    this.moveBlend = damp(this.moveBlend, p.stepping ? 1 : 0, 0.12, p.dt);
    this.sprintBlend = damp(this.sprintBlend, p.sprinting ? 1 : 0, 0.4, p.dt);
    this.turnLean = damp(this.turnLean, clamp(p.turnVelocity, -1.5, 1.5), 0.25, p.dt);
    const m = this.moveBlend;
    const th = p.phase * TAU;
    const A = p.strideAngle * m;
    const breathe = Math.sin(p.time * 1.1);

    // Legs: left plants at th=0 (thigh fully forward), right half a cycle later.
    this.poseLeg('L', th, A, m);
    this.poseLeg('R', th + Math.PI, A, m);

    // Pelvis: drops on each plant (weight landing), rolls over the planted foot, twists with the stride.
    const pelvis = b('pelvis');
    const bob = (1.6 + this.sprintBlend * 1.2) * m;
    pelvis.position.y = this.bindPos.get('pelvis')!.y - bob * (0.5 + 0.5 * Math.cos(2 * th)) + breathe * 0.15;
    pelvis.rotation.set(0, 0.08 * m * Math.cos(th), 0.05 * m * Math.sin(th) - this.turnLean * 0.08);

    // Spine leans forward with speed; chest breathes.
    const lean = 0.12 + 0.1 * clamp(p.speedRatio, 0, 2) + this.sprintBlend * 0.1;
    b('spine').rotation.set(lean, -0.06 * m * Math.cos(th), 0.02 * m * Math.sin(th));
    b('chest').rotation.set(0.04 + breathe * 0.015, -0.04 * m * Math.cos(th), 0);

    // Head stays level-ish, looks into turns, idles around.
    const look = clamp(this.turnLean * 0.35, -0.4, 0.4) + 0.18 * noise1D(p.time * 0.15, 7) * (1 - m);
    b('neck').rotation.set(-lean * 0.5 + 0.06 * m * Math.cos(2 * th), look * 0.5, 0);
    b('head').rotation.set(-lean * 0.4 - 0.05 + 0.04 * noise1D(p.time * 0.2, 3), look * 0.5, 0);
    b('jaw').rotation.x = 0.06 + 0.04 * (0.5 + 0.5 * breathe);

    // Arms: counter-swing to the legs, claws held forward.
    const swing = 0.22 * m;
    b('upperArmL').rotation.set(-0.15 + swing * Math.cos(th), 0, 0.15);
    b('upperArmR').rotation.set(-0.15 - swing * Math.cos(th), 0, -0.15);
    b('forearmL').rotation.x = -0.5 + 0.1 * breathe - swing * 0.5 * Math.cos(th);
    b('forearmR').rotation.x = -0.5 + 0.1 * breathe + swing * 0.5 * Math.cos(th);

    // Tail: a lagging wave down the chain, swings out opposite to turns, lifts for balance when sprinting.
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const t = b(`tail${i}`);
      const k = 0.5 + i * 0.12;
      const walkWave = 0.07 * m * Math.sin(th - i * 0.55) * k;
      const idleWave = 0.05 * Math.sin(p.time * 0.6 - i * 0.45) * (1 - m * 0.5);
      t.rotation.y = walkWave + idleWave - this.turnLean * 0.05 * k;
      t.rotation.x = 0.035 * this.sprintBlend + 0.015 * m * Math.cos(2 * th - i * 0.5);
    }

    // Plates pulse faintly at rest; the beam drives them hard.
    this.glowUniforms.uGlowIntensity.value = 0.9 + 0.25 * Math.sin(p.time * 2.2);
    this.bone('root').rotation.set(0, 0, 0);
    this.poseAction(p);
  }

  /** Additive overlays for combat actions and hit reactions, applied after the locomotion pose. */
  private poseAction(p: KaijuPoseInput): void {
    const a = p.action;
    const b = (n: BoneName) => this.bone(n);
    const t = a.t;
    switch (a.kind) {
      case 'attack':
        return this.isTail(a) ? this.poseTail(t) : this.poseClaw(t, a.side);
      case 'stomp':
        return this.poseStomp(t);
      case 'roar': {
        const r = COMBAT.roar;
        const k = smooth01(t / 0.35) * (1 - smooth01((t - (r.duration - 0.45)) / 0.45));
        const shake = 0.04 * Math.sin(t * 38) * k;
        b('neck').rotation.x -= 0.55 * k;
        b('head').rotation.x -= 0.45 * k + shake;
        b('jaw').rotation.x += 0.75 * k;
        b('spine').rotation.x -= 0.18 * k;
        b('chest').rotation.x -= 0.1 * k;
        for (const [side, sgn] of [['L', 1], ['R', -1]] as const) {
          b(`upperArm${side}`).rotation.z += 0.7 * k * sgn;
          b(`upperArm${side}`).rotation.x -= 0.6 * k;
        }
        for (let i = 0; i < 7; i++) b(`tail${i}`).rotation.x += 0.03 * k;
        return;
      }
      case 'beamCharge': {
        const c = a.charge;
        b('pelvis').position.y -= 2.5 * c;
        b('spine').rotation.x += 0.15 * c;
        b('head').rotation.x += 0.12 * c;
        b('jaw').rotation.x += 0.15 * c + 0.02 * Math.sin(p.time * 30) * c;
        for (let i = 0; i < 7; i++) b(`tail${i}`).rotation.x += 0.025 * c;
        this.glowUniforms.uGlowIntensity.value = lerp(1, COMBAT.beam.glowCharged, c * c) * (0.92 + 0.08 * Math.sin(p.time * 25));
        return;
      }
      case 'beamFire': {
        const k = a.charge;
        b('spine').rotation.x += 0.2 * k;
        b('pelvis').position.y -= 2 * k;
        // Aim the head along the beam; positive x pitches the snout down.
        const aim = clamp(-p.beamPitch, -0.6, 0.9) * k;
        b('neck').rotation.x += aim * 0.45 + 0.02 * Math.sin(t * 43) * k;
        b('head').rotation.x += aim * 0.45;
        b('jaw').rotation.x += 0.6 * k;
        this.glowUniforms.uGlowIntensity.value = COMBAT.beam.glowCharged * (0.85 + 0.15 * Math.sin(p.time * 40)) * Math.max(0.15, k);
        return;
      }
      case 'stagger': {
        const k = 1 - smooth01(t / COMBAT.health.staggerSeconds);
        b('spine').rotation.x -= 0.35 * k;
        b('head').rotation.x -= 0.3 * k;
        b('pelvis').rotation.z += 0.08 * Math.sin(t * 30) * k;
        b('upperArmL').rotation.z += 0.4 * k;
        b('upperArmR').rotation.z -= 0.4 * k;
        return;
      }
      case 'knockdown':
      case 'defeated': {
        const total = a.kind === 'defeated' ? Infinity : COMBAT.health.knockdownSeconds;
        const fall = Math.min(1, t / 0.55);
        const rise = 1 - smooth01((t - (total - 1.2)) / 1.2);
        const k = fall * fall * rise; // accelerating fall, eased get-up
        b('root').rotation.x = -1.35 * k;
        b('spine').rotation.x -= 0.2 * k;
        b('neck').rotation.x += 0.3 * k;
        for (const [side, sgn] of [['L', 1], ['R', -1]] as const) b(`upperArm${side}`).rotation.z += 0.6 * k * sgn;
        return;
      }
      default:
        return;
    }
  }

  private isTail(a: CombatAction): boolean {
    return a.move === 'tail';
  }

  private poseClaw(t: number, side: 1 | -1): void {
    const [ph, u] = movePhases(t, COMBAT.claw);
    const arm = side === 1 ? 'L' : 'R';
    // Key poses: [raise, out, twist, forearm].
    const wind = [-1.3, 0.9, 0.35, -0.3];
    const strike = [-0.8, -0.8, -0.45, 0.2];
    let k: number[];
    if (ph === 'windup') k = wind.map((v) => v * easeOut(u));
    else if (ph === 'active') k = wind.map((v, i) => lerp(v, strike[i]!, easeOut(u)));
    else if (ph === 'recovery') k = strike.map((v) => v * (1 - smooth01(u)));
    else return;
    const b = (n: BoneName) => this.bone(n);
    b(`upperArm${arm}`).rotation.x += k[0]!;
    b(`upperArm${arm}`).rotation.z += k[1]! * side;
    b(`forearm${arm}`).rotation.x += k[3]!;
    b('spine').rotation.y += k[2]! * side;
    b('chest').rotation.y += k[2]! * side * 0.6;
    b('head').rotation.y -= k[2]! * side * 0.5;
  }

  private poseTail(t: number): void {
    const [ph, u] = movePhases(t, COMBAT.tail);
    // Coil one way, then whip the body and tail through a wide arc.
    let twist: number;
    let whip: number;
    if (ph === 'windup') {
      twist = 0.45 * easeOut(u);
      whip = 0.3 * easeOut(u);
    } else if (ph === 'active') {
      const e = easeOut(u);
      twist = lerp(0.45, -0.95, e);
      whip = lerp(0.3, -0.75, e);
    } else if (ph === 'recovery') {
      const e = 1 - smooth01(u);
      twist = -0.95 * e;
      whip = -0.75 * e;
    } else return;
    const b = (n: BoneName) => this.bone(n);
    b('pelvis').rotation.y += twist * 0.6;
    b('spine').rotation.y += twist * 0.4;
    b('chest').rotation.y += twist * 0.2;
    b('head').rotation.y -= twist * 0.5;
    for (let i = 0; i < 7; i++) {
      // Later segments lag: the whip cracks at the tip.
      b(`tail${i}`).rotation.y += whip * (0.4 + i * 0.12);
      b(`tail${i}`).rotation.x += 0.04 * Math.abs(whip);
    }
  }

  private poseStomp(t: number): void {
    const [ph, u] = movePhases(t, COMBAT.stomp);
    // [thigh, shin, pelvisY, spineX, arms]
    const lift = [-1.15, 1.25, 2.5, -0.12, -0.5];
    const slam = [0.12, 0.05, -4.5, 0.28, 0.2];
    let k: number[];
    if (ph === 'windup') k = lift.map((v) => v * easeOut(u));
    else if (ph === 'active') k = lift.map((v, i) => lerp(v, slam[i]!, u * u));
    else if (ph === 'recovery') k = slam.map((v) => v * (1 - smooth01(u)));
    else return;
    const b = (n: BoneName) => this.bone(n);
    b('thighR').rotation.x += k[0]!;
    b('shinR').rotation.x += k[1]!;
    b('footR').rotation.x -= k[0]! + k[1]!;
    b('pelvis').position.y += k[2]!;
    b('spine').rotation.x += k[3]!;
    b('upperArmL').rotation.x += k[4]!;
    b('upperArmR').rotation.x += k[4]!;
  }

  private poseLeg(side: 'L' | 'R', th: number, A: number, m: number): void {
    const c = Math.cos(th);
    const s = Math.sin(th);
    const lift = Math.max(0, -s) * m; // raised while swinging forward
    const thigh = this.bone(`thigh${side}`);
    const shin = this.bone(`shin${side}`);
    const foot = this.bone(`foot${side}`);
    thigh.rotation.x = -A * c - lift * 0.28;
    shin.rotation.x = lift * 0.65;
    // Keep the sole roughly level; a little toe-off at the back of the stride.
    foot.rotation.x = -(thigh.rotation.x + shin.rotation.x) + Math.max(0, s) * 0.15 * m * (c < 0 ? 1 : 0);
  }

  // ---------------------------------------------------------------- build

  private bone(name: BoneName): THREE.Bone {
    const b = this.bones.get(name);
    if (!b) throw new Error(`Unknown bone ${name}`);
    return b;
  }

  private addBone(name: BoneName, parent: BoneName | null, x: number, y: number, z: number): void {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    this.bones.set(name, b);
    this.bindPos.set(name, b.position.clone());
    if (parent) this.bone(parent).add(b);
  }

  private buildSkeleton(): void {
    this.addBone('root', null, 0, 0, 0);
    this.addBone('pelvis', 'root', 0, 32, 0);
    this.addBone('spine', 'pelvis', 0, 3, 2);
    this.addBone('chest', 'spine', 0, 20, 4);
    this.addBone('neck', 'chest', 0, 15, 5);
    this.addBone('head', 'neck', 0, 8, 6);
    this.addBone('jaw', 'head', 0, -2, 4);
    for (const [s, x] of [['L', 1], ['R', -1]] as const) {
      this.addBone(`upperArm${s}`, 'chest', 11 * x, 7, 6);
      this.addBone(`forearm${s}`, `upperArm${s}`, 2 * x, -11, 5);
      this.addBone(`hand${s}`, `forearm${s}`, 0, -9, 4);
      this.addBone(`thigh${s}`, 'pelvis', 9 * x, -2, 0);
      this.addBone(`shin${s}`, `thigh${s}`, 0, -15, 4);
      this.addBone(`foot${s}`, `shin${s}`, 0, -12, -4);
    }
    this.addBone('tail0', 'pelvis', 0, -1, -11);
    for (let i = 1; i < TAIL_SEGMENTS; i++) this.addBone(`tail${i}`, `tail${i - 1}`, TAIL_STEP.x, TAIL_STEP.y, TAIL_STEP.z);
    this.bone('root').updateMatrixWorld(true);
  }

  private buildBody(): void {
    const C = COLORS;
    // Torso
    this.part('pelvis', ellipsoid(11, 10, 13), C.skin, at(0, 0, -2));
    this.part('spine', ellipsoid(13, 15, 12), C.skin, at(0, 10, 1));
    this.part('spine', ellipsoid(9.5, 13, 5), C.belly, at(0, 9, 8.5));
    this.part('chest', ellipsoid(14, 12, 11.5), C.skin, at(0, 4, 3));
    this.part('chest', ellipsoid(10, 9, 4.5), C.belly, at(0, 1, 10.5));
    // Neck + head
    this.part('neck', limb(v(0, -3, -1), v(0, 9, 6), 8.5, 6.5), C.skin);
    this.part('head', ellipsoid(6.5, 6, 7.5), C.skin, at(0, 2, 2));
    this.part('head', box(8, 5.5, 10), C.skin, at(0, 1.2, 9.5));
    this.part('head', box(9.5, 1.6, 6), C.skinDark, at(0, 4.6, 5.5)); // brow ridge
    for (const x of [-1, 1]) {
      this.part('head', box(1.4, 0.9, 1.6), C.eye, at(3.9 * x, 3.4, 7.8), 1.6);
      this.part('head', spike(1.4, 6, 2.2), C.plate, rotX(at(2.6 * x, 6.5, -1.5), -1.0), 0.5);
    }
    this.part('jaw', box(7, 2.6, 9), C.skinDark, at(0, -1.4, 5.5));
    this.part('jaw', box(6, 1, 8), C.belly, at(0, -2.8, 5));
    // Arms
    for (const [s, x] of [['L', 1], ['R', -1]] as const) {
      this.part(`upperArm${s}`, limb(v(0, 2, 0), v(2 * x, -11, 5), 4.5, 3.3), C.skin);
      this.part(`forearm${s}`, limb(v(0, 0, 0), v(0, -9, 4), 3.2, 2.6), C.skin);
      this.part(`hand${s}`, ellipsoid(3.2, 2.4, 3.4), C.skinDark, at(0, -1, 1));
      for (const cx of [-1.6, 0, 1.6]) {
        this.part(`hand${s}`, spike(0.8, 4.5, 0.8), C.claw, rotX(at(cx, -2.2, 3.2), 1.9));
      }
    }
    // Legs
    for (const s of ['L', 'R'] as const) {
      this.part(`thigh${s}`, ellipsoid(7.5, 10, 8.5), C.skin, at(0, -6, 2));
      this.part(`shin${s}`, limb(v(0, 1, 0), v(0, -12, -4), 5, 3.8), C.skin);
      this.part(`foot${s}`, box(9, 4, 13), C.skinDark, at(0, -1, 4.5));
      for (const cx of [-3, 0, 3]) {
        this.part(`foot${s}`, spike(1.1, 4, 1.1), C.claw, rotX(at(cx, -2, 11.5), 1.75));
      }
    }
    // Tail
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const end = TAIL_STEP.clone().multiplyScalar(1.15);
      this.part(`tail${i}`, limb(v(0, 0, 1.5), end, TAIL_RADII[i]!, TAIL_RADII[i + 1]!), C.skin);
    }
    // Dorsal plates: the signature silhouette. Glow rises toward the tips.
    const plates: [BoneName, number, number, number, number][] = [
      ['neck', 0, 7, -4, 4],
      ['chest', 0, 14, -5, 7],
      ['chest', 0, 6, -9, 9],
      ['spine', 0, 17, -9, 10],
      ['spine', 0, 8, -11, 11],
      ['spine', 0, -1, -11, 9.5],
      ['pelvis', 0, 6, -10, 8],
    ];
    for (const [bn, x, y, z, h] of plates) {
      this.part(bn, spike(h * 0.45, h, h * 0.12), C.plate, rotX(at(x, y, z), -0.75), 1);
      this.part(bn, spike(h * 0.3, h * 0.65, h * 0.1), C.plate, rotZ(rotX(at(x + 3.2, y - 1, z + 1), -0.6), -0.45), 1);
      this.part(bn, spike(h * 0.3, h * 0.65, h * 0.1), C.plate, rotZ(rotX(at(x - 3.2, y - 1, z + 1), -0.6), 0.45), 1);
    }
    for (let i = 0; i < TAIL_SEGMENTS - 1; i++) {
      const h = 7.5 - i * 1.0;
      this.part(`tail${i}`, spike(h * 0.45, h, h * 0.12), C.plate, rotX(at(0, TAIL_RADII[i]! * 0.75, -3), -1.0), 1);
    }
  }

  /** Add a primitive in bone-local space, rigidly skinned to that bone. */
  private part(boneName: BoneName, g: THREE.BufferGeometry, color: number, local?: THREE.Matrix4, glow = 0): void {
    if (local) g.applyMatrix4(local);
    // glow <= 1: fades in toward the part's local top (plates). glow > 1: uniform (eyes).
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const pos = g.attributes['position']!;
    const n = pos.count;
    const glowAttr = new Float32Array(n);
    if (glow > 0) {
      const span = Math.max(1e-3, bb.max.y - bb.min.y);
      for (let i = 0; i < n; i++) {
        const t = (pos.getY(i) - bb.min.y) / span;
        glowAttr[i] = glow > 1 ? glow : glow * t * t;
      }
    }
    g.applyMatrix4(this.bone(boneName).matrixWorld);
    const col = new THREE.Color(color);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([col.r, col.g, col.b], i * 3);
    const boneIndex = [...this.bones.keys()].indexOf(boneName);
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      skinIndex[i * 4] = boneIndex;
      skinWeight[i * 4] = 1;
    }
    g.deleteAttribute('uv');
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glowAttr, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    this.parts.push(g.index ? g.toNonIndexed() : g);
  }

  private createMaterial(): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.glowUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uGlowColor;\nuniform float uGlowIntensity;\nvarying float vGlow;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowColor * vGlow * uGlowIntensity;',
        );
    };
    return mat;
  }
}

// ------------------------------------------------------------- primitives

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const rotX = (m: THREE.Matrix4, a: number) => m.multiply(new THREE.Matrix4().makeRotationX(a));
const rotZ = (m: THREE.Matrix4, a: number) => m.multiply(new THREE.Matrix4().makeRotationZ(a));

function ellipsoid(rx: number, ry: number, rz: number): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(1, 1).scale(rx, ry, rz);
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

/** Flattened 4-sided cone pointing +Y, base at origin. */
function spike(width: number, height: number, thickness: number): THREE.BufferGeometry {
  return new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(thickness, height, width);
}

/** Tapered 6-sided cylinder from a to b. */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number): THREE.BufferGeometry {
  _dir.subVectors(b, a);
  const len = _dir.length();
  const g = new THREE.CylinderGeometry(rb, ra, len, 6, 1);
  _q.setFromUnitVectors(_up, _dir.normalize());
  _m.compose(a.clone().add(b).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(_m);
}
