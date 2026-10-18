import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { CityConfig } from '../../config/city';
import { DESTRUCTION } from '../../config/destruction';
import { ALL_GROUPS, collisionGroups, GROUP, type PhysicsSystem } from '../../systems/PhysicsSystem';
import { maxHpFor } from '../../systems/destruction/damage';
import type { CityGenerator } from './CityGenerator';
import type { CityPools } from './CityPools';
import { chunkDistance, chunkKey, chunksInRadius, chunksOverlappingCircle } from './chunkMath';
import type { DestructionState } from './DestructionState';
import type { ChunkSpec, PartSpec, StructureSpec } from './types';

export type StructureState = 'intact' | 'collapsing' | 'destroyed';

export interface Structure {
  readonly chunk: LoadedChunk;
  readonly index: number;
  readonly spec: StructureSpec;
  hp: number;
  readonly maxHp: number;
  state: StructureState;
  /** Instance slots per part while rendered; null when hidden (props out of range, or destroyed). */
  slots: number[] | null;
  rubbleSlot: number;
  collider: RAPIER.Collider | null;
  /** Sim time of the last contact damage (impact cooldown). */
  lastContact: number;
}

export interface LoadedChunk {
  readonly cx: number;
  readonly cz: number;
  readonly spec: ChunkSpec;
  readonly structures: Structure[];
  readonly flatSlots: number[];
  propsOn: boolean;
  physicsOn: boolean;
}

const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

/**
 * Streams generated chunks in/out around the player: allocates instances in
 * the shared pools, adds props only near the player, adds colliders only
 * within the physics radius, and restores destroyed state on reload.
 */
export class ChunkManager {
  readonly chunks = new Map<string, LoadedChunk>();
  private readonly byCollider = new Map<number, Structure>();
  private readonly size: number;
  /** Small props exist within this radius (quality preset). */
  propRadius = 800;

  constructor(
    private readonly cfg: CityConfig,
    private readonly gen: CityGenerator,
    private readonly pools: CityPools,
    private readonly physics: PhysicsSystem,
    private readonly destroyed: DestructionState,
  ) {
    this.size = gen.chunkSize;
  }

  get chunkSize(): number {
    return this.size;
  }

  /** Stream around (x, z). `budget` caps chunk loads this call (Infinity for the initial load). */
  update(x: number, z: number, drawDistance: number, budget = this.cfg.chunkLoadsPerFrame): void {
    const keepRadius = drawDistance + this.size * (0.75 + this.cfg.unloadHysteresis);
    for (const [key, chunk] of this.chunks) {
      if (chunkDistance(chunk.cx, chunk.cz, x, z, this.size) > keepRadius) {
        this.unload(chunk);
        this.chunks.delete(key);
      }
    }

    let loads = 0;
    for (const c of chunksInRadius(x, z, drawDistance + this.size * 0.75, this.size)) {
      if (this.chunks.has(chunkKey(c.cx, c.cz))) continue;
      if (loads++ >= budget) break;
      this.load(c.cx, c.cz);
    }

    // Detail levels for loaded chunks.
    const half = this.size * 0.75;
    for (const chunk of this.chunks.values()) {
      const d = chunkDistance(chunk.cx, chunk.cz, x, z, this.size);
      const wantProps = d < this.propRadius + half;
      if (wantProps !== chunk.propsOn) this.setProps(chunk, wantProps);
      const wantPhysics = d < this.cfg.physicsRadius + half;
      if (wantPhysics !== chunk.physicsOn) this.setPhysics(chunk, wantPhysics);
    }
  }

  /** Chunks within view that are not loaded yet (loading screen progress). */
  missingCount(x: number, z: number, drawDistance: number): number {
    let n = 0;
    for (const c of chunksInRadius(x, z, drawDistance + this.size * 0.75, this.size)) {
      if (!this.chunks.has(chunkKey(c.cx, c.cz))) n++;
    }
    return n;
  }

  structureForCollider(handle: number): Structure | undefined {
    return this.byCollider.get(handle);
  }

  /** Visit intact structures whose footprint circle overlaps (x, z, radius). */
  forEachNear(x: number, z: number, radius: number, cb: (s: Structure) => void): void {
    for (const [cx, cz] of chunksOverlappingCircle(x, z, radius + 60, this.size)) {
      const chunk = this.chunks.get(chunkKey(cx, cz));
      if (!chunk) continue;
      for (const s of chunk.structures) {
        if (s.state !== 'intact') continue;
        const r = Math.max(s.spec.halfW, s.spec.halfD);
        if (Math.hypot(s.spec.x - x, s.spec.z - z) <= radius + r) cb(s);
      }
    }
  }

  // ---------------------------------------------------- structure changes

  removeCollider(s: Structure): void {
    if (!s.collider) return;
    this.byCollider.delete(s.collider.handle);
    this.physics.world.removeCollider(s.collider, false);
    s.collider = null;
  }

  /** Free the structure's part instances (it is gone or replaced by rubble). */
  hideParts(s: Structure): void {
    if (!s.slots) return;
    s.spec.parts.forEach((p, i) => this.pools.removePart(p.pool, s.slots![i]!));
    s.slots = null;
  }

  isLoaded(chunk: LoadedChunk): boolean {
    return this.chunks.get(chunkKey(chunk.cx, chunk.cz)) === chunk;
  }

  /** Start of a collapse: persisted as destroyed right away; collider gone so the body can walk through. */
  beginCollapse(s: Structure): void {
    s.state = 'collapsing';
    this.destroyed.markDestroyed(s.chunk.cx, s.chunk.cz, s.index);
    this.removeCollider(s);
  }

  /** End of a collapse (or instant crush): parts replaced by the wreck. */
  finishCollapse(s: Structure): void {
    s.state = 'destroyed';
    if (!this.isLoaded(s.chunk)) return;
    this.hideParts(s);
    this.showWreck(s);
  }

  destroyInstant(s: Structure): void {
    this.beginCollapse(s);
    this.finishCollapse(s);
  }

  /** Darken a damaged structure toward soot as HP drops. */
  tintDamage(s: Structure): void {
    if (!s.slots) return;
    const k = 1 - (1 - s.hp / s.maxHp) * (1 - DESTRUCTION.damagedDarken);
    s.spec.parts.forEach((p, i) => {
      this.pools.pools[p.pool].setColor(s.slots![i]!, _c.setHex(p.color).multiplyScalar(k));
    });
  }

  // ---------------------------------------------------- load / unload

  private load(cx: number, cz: number): void {
    const spec = this.gen.generate(cx, cz);
    const chunk: LoadedChunk = { cx, cz, spec, structures: [], flatSlots: [], propsOn: false, physicsOn: false };
    for (const f of spec.flats) chunk.flatSlots.push(this.pools.addPart(f));
    spec.structures.forEach((st, index) => {
      const s: Structure = {
        chunk, index, spec: st,
        hp: maxHpFor(st, DESTRUCTION), maxHp: maxHpFor(st, DESTRUCTION),
        state: this.destroyed.isDestroyed(cx, cz, index) ? 'destroyed' : 'intact',
        slots: null, rubbleSlot: -1, collider: null, lastContact: -Infinity,
      };
      chunk.structures.push(s);
      if (st.size === 'prop') return; // added with the prop detail level
      if (s.state === 'destroyed') this.showWreck(s);
      else s.slots = st.parts.map((p) => this.pools.addPart(p));
    });
    this.chunks.set(chunkKey(cx, cz), chunk);
  }

  private unload(chunk: LoadedChunk): void {
    if (chunk.physicsOn) this.setPhysics(chunk, false);
    for (const slot of chunk.flatSlots) this.pools.removePart('flat', slot);
    for (const s of chunk.structures) {
      this.hideParts(s);
      if (s.rubbleSlot >= 0) {
        this.pools.removePart(s.spec.size === 'prop' ? s.spec.parts[0]!.pool : 'rubble', s.rubbleSlot);
        s.rubbleSlot = -1;
      }
    }
  }

  private setProps(chunk: LoadedChunk, on: boolean): void {
    chunk.propsOn = on;
    for (const s of chunk.structures) {
      if (s.spec.size !== 'prop') continue;
      if (on) {
        if (s.state === 'destroyed') this.showWreck(s);
        else s.slots = s.spec.parts.map((p) => this.pools.addPart(p));
      } else {
        this.hideParts(s);
        if (s.rubbleSlot >= 0) {
          this.pools.removePart(s.spec.parts[0]!.pool, s.rubbleSlot);
          s.rubbleSlot = -1;
        }
      }
    }
  }

  private setPhysics(chunk: LoadedChunk, on: boolean): void {
    chunk.physicsOn = on;
    for (const s of chunk.structures) {
      if (s.spec.size !== 'large') continue;
      if (!on) {
        this.removeCollider(s);
        continue;
      }
      if (s.state !== 'intact' || s.collider) continue;
      const st = s.spec;
      const round = st.kind === 'chimney' || st.kind === 'tank';
      const desc = round
        ? RAPIER.ColliderDesc.cylinder(st.height / 2, st.halfW)
        : RAPIER.ColliderDesc.cuboid(st.halfW, st.height / 2, st.halfD);
      _q.setFromAxisAngle(UP, st.rotY);
      desc.setTranslation(st.x, st.height / 2, st.z).setRotation(_q).setCollisionGroups(collisionGroups(GROUP.STRUCTURE, ALL_GROUPS));
      s.collider = this.physics.world.createCollider(desc);
      this.byCollider.set(s.collider.handle, s);
    }
  }

  /** Rubble mound for buildings; a flattened wreck for cars; nothing for other props. */
  private showWreck(s: Structure): void {
    const st = s.spec;
    if (st.size === 'prop') {
      if (st.kind !== 'car' || !s.chunk.propsOn) return;
      const p = st.parts[0]!;
      s.rubbleSlot = this.pools.addPart({ ...p, sy: p.sy * 0.3, color: darken(p.color, 0.45) });
      return;
    }
    const D = DESTRUCTION;
    const h = Math.min(D.rubbleMaxHeight, Math.max(D.rubbleMinHeight, st.height * D.rubbleHeightFraction));
    const rubble: PartSpec = {
      pool: 'flat', x: st.x, y: 0, z: st.z,
      sx: st.halfW * 2 * 1.2, sy: h, sz: st.halfD * 2 * 1.2, rotY: st.rotY,
      color: rubbleColor(st.parts[0]?.color ?? 0x888888),
    };
    s.rubbleSlot = this.pools.pools.rubble.add(
      new THREE.Matrix4().compose(
        new THREE.Vector3(rubble.x, 0, rubble.z),
        _q.setFromAxisAngle(UP, rubble.rotY),
        new THREE.Vector3(rubble.sx, rubble.sy, rubble.sz),
      ),
      _c.setHex(rubble.color),
    );
  }
}

const _dust = new THREE.Color(0x6f6a62);

/** Wreck color: mostly concrete dust, with a hint of the original facade. */
function rubbleColor(hex: number): number {
  return _c.setHex(hex).lerp(_dust, 0.7).getHex();
}

function darken(hex: number, k: number): number {
  return _c.setHex(hex).multiplyScalar(k).getHex();
}
