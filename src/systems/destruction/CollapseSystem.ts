import * as THREE from 'three';
import { DESTRUCTION } from '../../config/destruction';
import { DUST, SMOKE } from '../../config/effects';
import type { ChunkManager, Structure } from '../../world/city/ChunkManager';
import type { CityPools } from '../../world/city/CityPools';
import type { DustSystem } from '../effects/DustSystem';
import type { DebrisSystem } from './DebrisSystem';
import { collapseDuration } from './damage';

interface Collapse {
  s: Structure;
  t: number;
  duration: number;
  tiltX: number;
  tiltZ: number;
  dustTimer: number;
  debrisTotal: number;
  debrisSpawned: number;
}

interface SmokeEmitter {
  x: number;
  z: number;
  radius: number;
  remaining: number;
  timer: number;
  scale: number;
}

const _m = new THREE.Matrix4();
const _base = new THREE.Matrix4();
const _tilt = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Visual demolition: the building pancakes into its footprint with an
 * accelerating fall and a slight lean, pouring dust and shedding debris from
 * its top, then becomes rubble and smokes for a while. Render-rate, visual only;
 * gameplay state (collider, persistence) is settled when the collapse starts.
 */
export class CollapseSystem {
  private readonly active: Collapse[] = [];
  private readonly smoke: SmokeEmitter[] = [];

  constructor(
    private readonly chunks: ChunkManager,
    private readonly pools: CityPools,
    private readonly dust: DustSystem,
    private readonly smokeFx: DustSystem,
    private readonly debris: DebrisSystem,
  ) {}

  get activeCount(): number {
    return this.active.length;
  }

  /** `awayX/Z`: direction to lean toward (away from whatever knocked it down). */
  start(s: Structure, awayX: number, awayZ: number): void {
    this.chunks.beginCollapse(s);
    const len = Math.hypot(awayX, awayZ) || 1;
    const h = s.spec.height;
    this.active.push({
      s,
      t: 0,
      duration: collapseDuration(h, DESTRUCTION),
      tiltX: awayX / len,
      tiltZ: awayZ / len,
      dustTimer: 0,
      debrisTotal: Math.min(DESTRUCTION.debrisMaxPerCollapse, Math.round((h / 10) * DESTRUCTION.debrisPer10m)),
      debrisSpawned: 0,
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i]!;
      if (!this.chunks.isLoaded(c.s.chunk) || !c.s.slots) {
        this.chunks.finishCollapse(c.s);
        this.active.splice(i, 1);
        continue;
      }
      c.t += dt;
      const p = Math.min(1, c.t / c.duration);
      this.pose(c, p);
      this.emit(c, p, dt);
      if (p >= 1) {
        this.finish(c);
        this.active.splice(i, 1);
      }
    }
    this.updateSmoke(dt);
  }

  private pose(c: Collapse, p: number): void {
    const e = p * p; // accelerating fall
    const squash = 1 - 0.92 * e;
    const st = c.s.spec;
    // Lean about the footprint center, away from the attacker, growing as it falls.
    _axis.set(c.tiltZ, 0, -c.tiltX).normalize();
    _tilt.makeRotationAxis(_axis, 0.22 * e);
    const jitter = 0.6 * (1 - p) * Math.sin(c.t * 47);
    _base.makeTranslation(st.x + jitter, st.y, st.z - jitter);
    st.parts.forEach((part, i) => {
      _q.setFromAxisAngle(UP, part.rotY);
      _p.set(part.x - st.x, (part.y - st.y) * squash, part.z - st.z);
      _s.set(part.sx, part.sy * squash, part.sz);
      _local.compose(_p, _q, _s);
      _m.multiplyMatrices(_base, _tilt).multiply(_local);
      this.pools.pools[part.pool].setMatrix(c.s.slots![i]!, _m);
    });
  }

  private emit(c: Collapse, p: number, dt: number): void {
    const st = c.s.spec;
    const scale = Math.min(DUST.maxBurstScale, Math.max(st.halfW, st.halfD) / 10);
    c.dustTimer -= dt;
    if (c.dustTimer <= 0) {
      c.dustTimer = DUST.collapseInterval;
      this.dust.burst(st.x, st.y, st.z, DUST.collapse, scale);
    }
    const target = Math.floor(Math.min(1, p * 1.3) * c.debrisTotal);
    const top = st.height * (1 - 0.92 * p * p);
    while (c.debrisSpawned < target) {
      c.debrisSpawned++;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      const out = 4 + Math.random() * 10;
      this.debris.spawn({
        x: st.x + Math.cos(a) * st.halfW * r,
        y: top * (0.5 + Math.random() * 0.5),
        z: st.z + Math.sin(a) * st.halfD * r,
        vx: Math.cos(a) * out + c.tiltX * 6,
        vy: Math.random() * 6,
        vz: Math.sin(a) * out + c.tiltZ * 6,
        size: Math.min(14, 3 + Math.random() * Math.sqrt(st.halfW * st.halfD) * 0.35),
        color: st.parts[0]?.color ?? 0x888888,
      });
    }
  }

  private finish(c: Collapse): void {
    const st = c.s.spec;
    this.chunks.finishCollapse(c.s);
    const scale = Math.min(DUST.maxBurstScale, Math.max(st.halfW, st.halfD) / 8);
    this.dust.burst(st.x, st.y, st.z, DUST.collapse, scale);
    this.smoke.push({
      x: st.x,
      z: st.z,
      radius: Math.max(st.halfW, st.halfD),
      remaining: SMOKE.duration,
      timer: 0,
      scale: Math.min(2, Math.max(0.6, st.height / 60)),
    });
  }

  private updateSmoke(dt: number): void {
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const e = this.smoke[i]!;
      e.remaining -= dt;
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = SMOKE.interval;
        const fade = Math.max(0.2, e.remaining / SMOKE.duration);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * e.radius * 0.6;
        this.smokeFx.burst(e.x + Math.cos(a) * r, 4, e.z + Math.sin(a) * r, SMOKE.plume, e.scale * fade);
      }
      if (e.remaining <= 0) this.smoke.splice(i, 1);
    }
  }
}
