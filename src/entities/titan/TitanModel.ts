import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp, noise1D, TAU, wrapAngle } from '../../core/math';
import type { CombatConfig } from '../../config/combat';
import type { CombatAction } from './TitanCombat';
import type { TitanDesign } from './designs';

/**
 * Placeholder titan built from low-poly primitives, rigidly skinned to a bone
 * hierarchy and merged into ONE SkinnedMesh (one draw call + one shadow call).
 * Animation is procedural for now; Milestone 7 can swap in authored clips on
 * the same kind of skeleton. Proportions here are art, not gameplay tuning.
 */

type BoneName =
  | 'root' | 'pelvis' | 'spine' | 'chest' | 'neck' | 'head' | 'jaw'
  | 'upperArmL' | 'forearmL' | 'handL' | 'upperArmR' | 'forearmR' | 'handR'
  | 'thighL' | 'shinL' | 'footL' | 'thighR' | 'shinR' | 'footR'
  | `tail${number}`;

/** Height the primitives are authored at; the entity scales the model to TITAN_BODY.height. */
export const MODEL_DESIGN_HEIGHT = 80;
/** Approximate mouth position in the bind pose (design units), for sim-side beam origins. */
export const MOUTH_DESIGN = { height: 77, forward: 33 };

const TAIL_SEGMENTS = 7;
const BASE_TAIL_STEP = new THREE.Vector3(0, -3.8, -9.5);
const BASE_TAIL_RADII = [9, 8, 6.8, 5.6, 4.4, 3.2, 2.0, 0.8];

export interface TitanPoseInput {
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

/** Most a foot is raised or lowered to meet the ground (design units). */
const MAX_PLANT = 9;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

export class TitanModel {
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  /** Hip-to-ankle length at design scale, used to derive stride angles. */
  readonly legLength: number;
  readonly glowUniforms = {
    uGlowColor: { value: new THREE.Color(0x58d8ff) },
    uGlowIntensity: { value: 1 },
  };
  private readonly tailStep: THREE.Vector3;
  private readonly tailRadii: number[];

  /** Follows the snout tip; read its world position for beam visuals. */
  readonly mouth = new THREE.Object3D();
  private readonly bones = new Map<BoneName, THREE.Bone>();
  private readonly bindPos = new Map<BoneName, THREE.Vector3>();
  private readonly parts: THREE.BufferGeometry[] = [];
  private moveBlend = 0;
  private sprintBlend = 0;
  private turnLean = 0;

  constructor(
    readonly design: TitanDesign,
    private readonly cfg: CombatConfig,
  ) {
    this.glowUniforms.uGlowColor.value.setHex(design.glowColor);
    this.tailStep = BASE_TAIL_STEP.clone().multiplyScalar(design.tailScale);
    this.tailRadii = BASE_TAIL_RADII.map((r) => r * Math.sqrt(design.tailScale));
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
  pose(p: TitanPoseInput): void {
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
    const lean = 0.12 + this.design.hunch + 0.1 * clamp(p.speedRatio, 0, 2) + this.sprintBlend * 0.1;
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
  private poseAction(p: TitanPoseInput): void {
    const a = p.action;
    const b = (n: BoneName) => this.bone(n);
    const t = a.t;
    switch (a.kind) {
      case 'attack':
        if (a.move === 'tail') return this.poseTail(t);
        if (a.move === 'lunge') return this.poseLunge(t);
        if (a.move === 'volley') return this.poseVolley(t);
        if (a.move === 'pulse') return this.posePulse(t);
        return this.poseClaw(t, a.side);
      case 'stomp':
        return this.poseStomp(t);
      case 'roar': {
        const r = this.cfg.roar;
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
        this.glowUniforms.uGlowIntensity.value = lerp(1, this.cfg.beam.glowCharged, c * c) * (0.92 + 0.08 * Math.sin(p.time * 25));
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
        this.glowUniforms.uGlowIntensity.value = this.cfg.beam.glowCharged * (0.85 + 0.15 * Math.sin(p.time * 40)) * Math.max(0.15, k);
        return;
      }
      case 'stagger': {
        const k = 1 - smooth01(t / Math.max(0.1, a.staggerSeconds));
        b('spine').rotation.x -= 0.35 * k;
        b('head').rotation.x -= 0.3 * k;
        b('pelvis').rotation.z += 0.08 * Math.sin(t * 30) * k;
        b('upperArmL').rotation.z += 0.4 * k;
        b('upperArmR').rotation.z -= 0.4 * k;
        return;
      }
      case 'knockdown':
      case 'defeated': {
        const total = a.kind === 'defeated' ? Infinity : this.cfg.health.knockdownSeconds;
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

  private poseLunge(t: number): void {
    const m = this.cfg.lunge;
    if (!m) return;
    const [ph, u] = movePhases(t, m);
    // Crouch, then throw the body forward with both arms reaching.
    let k: number;
    let reach: number;
    if (ph === 'windup') {
      k = -0.5 * easeOut(u);
      reach = 0.3 * easeOut(u);
    } else if (ph === 'active') {
      k = lerp(-0.5, 1, easeOut(u));
      reach = lerp(0.3, 1, easeOut(u));
    } else if (ph === 'recovery') {
      k = 1 - smooth01(u);
      reach = k;
    } else return;
    const b = (n: BoneName) => this.bone(n);
    b('spine').rotation.x += 0.3 * k;
    b('chest').rotation.x += 0.15 * k;
    b('pelvis').position.y += 2 * Math.min(0, k) * 2;
    for (const [side, sgn] of [['L', 1], ['R', -1]] as const) {
      b(`upperArm${side}`).rotation.x -= 1.3 * reach;
      b(`upperArm${side}`).rotation.z += 0.2 * reach * sgn;
      b(`forearm${side}`).rotation.x += 0.4 * reach;
    }
    b('jaw').rotation.x += 0.4 * Math.max(0, k);
  }

  private posePulse(t: number): void {
    const m = this.cfg.pulse;
    if (!m) return;
    const [ph, u] = movePhases(t, m);
    // Hunch and gather (plates flare brighter), then throw the body open as the blast goes off.
    let gather = 0;
    let burst = 0;
    if (ph === 'windup') gather = easeOut(u);
    else if (ph === 'active') {
      gather = 1 - u;
      burst = u;
    } else if (ph === 'recovery') burst = 1 - smooth01(u);
    else return;
    const b = (n: BoneName) => this.bone(n);
    b('spine').rotation.x += 0.35 * gather - 0.25 * burst;
    b('chest').rotation.x += 0.15 * gather - 0.1 * burst;
    b('pelvis').position.y -= 4 * gather;
    b('head').rotation.x += 0.3 * gather - 0.5 * burst;
    b('jaw').rotation.x += 0.7 * burst;
    for (const [side, sgn] of [['L', 1], ['R', -1]] as const) {
      b(`upperArm${side}`).rotation.z += (-0.2 * gather + 1.0 * burst) * sgn;
      b(`upperArm${side}`).rotation.x -= 0.5 * gather;
    }
    for (let i = 0; i < 7; i++) b(`tail${i}`).rotation.x += 0.05 * burst;
    this.glowUniforms.uGlowIntensity.value = 1 + 5 * gather * gather + 8 * burst;
  }

  private poseVolley(t: number): void {
    const m = this.cfg.volley;
    if (!m?.projectile) return;
    const [ph, u] = movePhases(t, m);
    const k = ph === 'windup' ? easeOut(u) : ph === 'active' ? 1 : ph === 'recovery' ? 1 - smooth01(u) : 0;
    // Recoil pulse on each shot.
    const shotT = (t - m.windup) / m.projectile.interval;
    const recoil = ph === 'active' ? Math.max(0, 1 - (shotT - Math.floor(shotT)) * 4) : 0;
    const b = (n: BoneName) => this.bone(n);
    b('spine').rotation.x += 0.12 * k - 0.06 * recoil;
    b('neck').rotation.x += 0.1 * k - 0.1 * recoil;
    b('jaw').rotation.x += 0.5 * k;
    this.glowUniforms.uGlowIntensity.value = 1 + 3 * k + 2 * recoil;
  }

  private poseClaw(t: number, side: 1 | -1): void {
    const [ph, u] = movePhases(t, this.cfg.claw);
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
    const [ph, u] = movePhases(t, this.cfg.tail);
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
    const [ph, u] = movePhases(t, this.cfg.stomp);
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

  /**
   * Plant the feet on uneven ground after `pose()`. `groundAt(x, z)` takes a point in
   * model space (design units, +Z forward) and returns the ground height there
   * relative to the body's own ground, in design units. Each leg is solved as a
   * two-bone chain in its sagittal plane; the hips drop when a foot must reach lower
   * than the leg can extend. `slope` (rad, + = uphill ahead) leans the torso into
   * climbs; `weight` (0..1) fades the whole effect (off while lying down).
   */
  plantFeet(groundAt: (x: number, z: number) => number, slope: number, weight: number): void {
    if (weight <= 0.001) return;
    const pelvis = this.bone('pelvis');
    const dy: number[] = [];
    for (const side of ['L', 'R'] as const) {
      const ankle = this.ankleOf(side);
      const thigh = this.bindPos.get(`thigh${side}`)!;
      // Sample under the ankle (the foot pivots there and is tilted to the slope below).
      dy.push(clamp(groundAt(thigh.x, ankle.z), -MAX_PLANT, MAX_PLANT) * weight);
    }
    const drop = Math.max(0, -Math.min(dy[0]!, dy[1]!));
    pelvis.position.y -= drop;
    this.solveLeg('L', dy[0]! + drop, slope * weight);
    this.solveLeg('R', dy[1]! + drop, slope * weight);
    this.bone('spine').rotation.x += clamp(slope, -0.4, 0.4) * 0.35 * weight;
  }

  /** Ankle position in pelvis space (y, z) from the current thigh/shin angles. */
  private ankleOf(side: 'L' | 'R'): { y: number; z: number } {
    const a = this.bone(`thigh${side}`).rotation.x;
    const b = this.bone(`shin${side}`).rotation.x;
    const s = this.bindPos.get(`shin${side}`)!;
    const f = this.bindPos.get(`foot${side}`)!;
    // Rotation about X acts on (y, z) like multiplying y + iz by e^(i angle).
    const fy = f.y * Math.cos(b) - f.z * Math.sin(b);
    const fz = f.y * Math.sin(b) + f.z * Math.cos(b);
    const uy = s.y + fy;
    const uz = s.z + fz;
    return { y: uy * Math.cos(a) - uz * Math.sin(a), z: uy * Math.sin(a) + uz * Math.cos(a) };
  }

  /** Move one ankle `lift` design units up (two-bone IK), keeping the sole on the slope. */
  private solveLeg(side: 'L' | 'R', lift: number, slope: number): void {
    const thigh = this.bone(`thigh${side}`);
    const shin = this.bone(`shin${side}`);
    const foot = this.bone(`foot${side}`);
    const s = this.bindPos.get(`shin${side}`)!;
    const f = this.bindPos.get(`foot${side}`)!;
    const sole = foot.rotation.x + thigh.rotation.x + shin.rotation.x;
    const ankle = this.ankleOf(side);
    const ty = ankle.y + lift;
    const tz = ankle.z;
    const l1 = Math.hypot(s.y, s.z);
    const l2 = Math.hypot(f.y, f.z);
    const d = clamp(Math.hypot(ty, tz), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
    const psiS = Math.atan2(s.z, s.y);
    const psiF = Math.atan2(f.z, f.y);
    const k = Math.acos(clamp((d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2), -1, 1));
    // Two knee solutions: keep the one closest to the current bend.
    const b1 = psiS - psiF + k;
    const b2 = psiS - psiF - k;
    const b = Math.abs(wrapAngle(b1 - shin.rotation.x)) < Math.abs(wrapAngle(b2 - shin.rotation.x)) ? b1 : b2;
    const uy = s.y + f.y * Math.cos(b) - f.z * Math.sin(b);
    const uz = s.z + f.y * Math.sin(b) + f.z * Math.cos(b);
    const a = Math.atan2(tz, ty) - Math.atan2(uz, uy);
    thigh.rotation.x = wrapAngle(a);
    shin.rotation.x = wrapAngle(b);
    foot.rotation.x = sole - thigh.rotation.x - shin.rotation.x - clamp(slope, -0.5, 0.5) * 0.8;
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
    const d = this.design;
    this.addBone('neck', 'chest', 0, 15, 5);
    this.addBone('head', 'neck', 0, 8 * d.neckScale, 6 * d.neckScale);
    this.addBone('jaw', 'head', 0, -2, 4);
    for (const [s, x] of [['L', 1], ['R', -1]] as const) {
      this.addBone(`upperArm${s}`, 'chest', 11 * x, 7, 6);
      this.addBone(`forearm${s}`, `upperArm${s}`, 2 * x * d.armScale, -11 * d.armScale, 5 * d.armScale);
      this.addBone(`hand${s}`, `forearm${s}`, 0, -9 * d.armScale, 4 * d.armScale);
      this.addBone(`thigh${s}`, 'pelvis', 9 * x, -2, 0);
      this.addBone(`shin${s}`, `thigh${s}`, 0, -15, 4);
      this.addBone(`foot${s}`, `shin${s}`, 0, -12, -4);
    }
    this.addBone('tail0', 'pelvis', 0, -1, -11);
    const ts = this.tailStep;
    for (let i = 1; i < TAIL_SEGMENTS; i++) this.addBone(`tail${i}`, `tail${i - 1}`, ts.x, ts.y, ts.z);
    this.bone('root').updateMatrixWorld(true);
  }

  private buildBody(): void {
    const d = this.design;
    const C = d.palette;
    const A = d.armScale;
    // Torso
    this.part('pelvis', ellipsoid(11, 10, 13), C.skin, at(0, 0, -2));
    this.part('spine', ellipsoid(13 * d.bulk, 15, 12 * d.bulk), C.skin, at(0, 10, 1));
    this.part('spine', ellipsoid(9.5 * d.bulk, 13, 5), C.belly, at(0, 9, 8.5));
    this.part('chest', ellipsoid(14 * d.bulk, 12, 11.5 * d.bulk), C.skin, at(0, 4, 3));
    this.part('chest', ellipsoid(10 * d.bulk, 9, 4.5), C.belly, at(0, 1, 10.5));
    // Neck + head
    this.part('neck', limb(v(0, -3, -1), v(0, 9 * d.neckScale, 6 * d.neckScale), 8.5, 6.5 / Math.sqrt(d.neckScale)), C.skin);
    this.part('head', ellipsoid(6.5, 6, 7.5), C.skin, at(0, 2, 2));
    this.part('head', box(8, 5.5, 10), C.skin, at(0, 1.2, 9.5));
    this.part('head', box(9.5, 1.6, 6), C.skinDark, at(0, 4.6, 5.5)); // brow ridge
    for (const x of [-1, 1]) {
      this.part('head', box(1.4, 0.9, 1.6), C.eye, at(3.9 * x, 3.4, 7.8), 1.6);
      if (d.horns) {
        // Big swept horns curling back over the skull.
        this.part('head', spike(2.4, 11, 2.4), C.claw, rotZ(rotX(at(4 * x, 5, 1), -1.1), -0.5 * x));
        this.part('head', spike(1.4, 6, 1.4), C.claw, rotZ(rotX(at(5.5 * x, 3, -4), -1.9), -0.9 * x));
      } else if (!d.crest) {
        this.part('head', spike(1.4, 6, 2.2), C.plate, rotX(at(2.6 * x, 6.5, -1.5), -1.0), 0.5);
      }
      if (d.tusks) this.part('jaw', spike(1.1, 6, 1.1), C.claw, rotX(at(3 * x, -1, 9), 0.5));
    }
    if (d.crest) {
      // Fan crest sweeping back from the skull, glowing at the edges.
      for (const [y, z, a, h] of [[6, 0, -1.25, 11], [5.5, -3, -1.45, 13], [4.5, -6, -1.65, 10]] as const) {
        this.part('head', spike(h * 0.5, h, h * 0.08), C.plate, rotX(at(0, y, z), a), 1);
      }
    }
    this.part('jaw', box(7, 2.6, 9), C.skinDark, at(0, -1.4, 5.5));
    this.part('jaw', box(6, 1, 8), C.belly, at(0, -2.8, 5));
    // Arms
    for (const [s, x] of [['L', 1], ['R', -1]] as const) {
      this.part(`upperArm${s}`, limb(v(0, 2, 0), v(2 * x * A, -11 * A, 5 * A), 4.5 * A, 3.3 * A), C.skin);
      this.part(`forearm${s}`, limb(v(0, 0, 0), v(0, -9 * A, 4 * A), 3.2 * A, 2.6 * A), C.skin);
      this.part(`hand${s}`, ellipsoid(3.2 * A, 2.4 * A, 3.4 * A), C.skinDark, at(0, -1, 1));
      for (const cx of [-1.6, 0, 1.6]) {
        this.part(`hand${s}`, spike(0.8 * A, 4.5 * d.clawLength, 0.8 * A), C.claw, rotX(at(cx * A, -2.2 * A, 3.2 * A), 1.9));
      }
      if (d.shoulderOrbs) {
        this.part(`upperArm${s}`, ellipsoid(3.4, 3.4, 3.4), C.plate, at(1.5 * x, 3.5, -1), 1.6);
      }
    }
    // Legs
    for (const s of ['L', 'R'] as const) {
      this.part(`thigh${s}`, ellipsoid(7.5 * d.bulk, 10, 8.5 * d.bulk), C.skin, at(0, -6, 2));
      this.part(`shin${s}`, limb(v(0, 1, 0), v(0, -12, -4), 5, 3.8), C.skin);
      this.part(`foot${s}`, box(9, 4, 13), C.skinDark, at(0, -1, 4.5));
      for (const cx of [-3, 0, 3]) {
        this.part(`foot${s}`, spike(1.1, 4, 1.1), C.claw, rotX(at(cx, -2, 11.5), 1.75));
      }
    }
    // Tail
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const end = this.tailStep.clone().multiplyScalar(1.15);
      this.part(`tail${i}`, limb(v(0, 0, 1.5), end, this.tailRadii[i]!, this.tailRadii[i + 1]!), C.skin);
    }
    this.buildBack();
  }

  /** The back silhouette is the quickest way to tell titan apart at distance. */
  private buildBack(): void {
    const d = this.design;
    const C = d.palette;
    const ridge: [BoneName, number, number, number][] = [
      ['neck', 7, -4, 4],
      ['chest', 14, -5, 7],
      ['chest', 6, -9, 9],
      ['spine', 17, -9, 10],
      ['spine', 8, -11, 11],
      ['spine', -1, -11, 9.5],
      ['pelvis', 6, -10, 8],
    ];
    for (const [bn, y, z, h0] of ridge) {
      if (d.back === 'plates') {
        const h = h0;
        this.part(bn, spike(h * 0.45, h, h * 0.12), C.plate, rotX(at(0, y, z), -0.75), 1);
        this.part(bn, spike(h * 0.3, h * 0.65, h * 0.1), C.plate, rotZ(rotX(at(3.2, y - 1, z + 1), -0.6), -0.45), 1);
        this.part(bn, spike(h * 0.3, h * 0.65, h * 0.1), C.plate, rotZ(rotX(at(-3.2, y - 1, z + 1), -0.6), 0.45), 1);
      } else if (d.back === 'spikes') {
        // Rows of thick, short horns: armored and menacing, faint ember glow.
        const h = h0 * 0.7;
        for (const x of [-4, 4]) this.part(bn, spike(h * 0.35, h, h * 0.35), C.plate, rotZ(rotX(at(x, y, z), -0.9), -x * 0.06), 0.35);
      } else {
        // Smooth crest: one tall continuous fin.
        const h = h0 * 1.15;
        this.part(bn, spike(h * 0.8, h, h * 0.06), C.plate, rotX(at(0, y, z), -1.05), 0.8);
      }
    }
    for (let i = 0; i < TAIL_SEGMENTS - 1; i++) {
      const h = (7.5 - i * 1.0) * Math.sqrt(d.tailScale);
      const glow = d.back === 'spikes' ? 0.35 : 1;
      this.part(`tail${i}`, spike(h * 0.45, h, d.back === 'spikes' ? h * 0.35 : h * 0.12), C.plate, rotX(at(0, this.tailRadii[i]! * 0.75, -3), -1.0), glow);
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
