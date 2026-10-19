import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { DUST } from '../config/effects';
import { CITY } from '../config/city';
import type { GameEventBus } from '../core/events';
import { Titan, type RemotePose } from '../entities/titan/Titan';
import { PLAYER_SPEC } from '../entities/titan/TitanSpec';
import type { MoveId } from '../entities/titan/TitanCombat';
import type { TitanState as TitanAction } from '../entities/titan/locomotion';
import { colorwayFor, designFor, type TitanChoice } from '../entities/titan/roster';
import type { PhysicsSystem } from '../systems/PhysicsSystem';
import type { CombatSystem } from '../systems/combat/CombatSystem';
import type { DestructionSystem } from '../systems/destruction/DestructionSystem';
import type { DustSystem } from '../systems/effects/DustSystem';
import { BeamFx } from '../systems/effects/BeamFx';
import { terrain } from '../world/terrain/Terrain';
import type { Message, PlayerInfo, TitanState } from './protocol';
import type { Room } from './Room';
import { SnapshotBuffer, type Sample } from './SnapshotBuffer';

/** State packets per second (every 3rd sim tick at 60 Hz). */
const SEND_EVERY_TICKS = 3;
/** Remote titans are shown this far in the past, so two packets bracket the moment. */
const INTERP_DELAY = 0.12;
/** A hit within this window gets the KO credit. */
const CREDIT_SECONDS = 15;
/** Seconds lying defeated before respawning. */
const RESPAWN_SECONDS = 5;
/** Respawn at least this far from every other titan (m). */
const RESPAWN_DISTANCE = 1100;

const STATES: readonly TitanAction[] = ['idle', 'walk', 'sprint', 'attack', 'stomp', 'beamCharge', 'beamFire', 'roar', 'stagger', 'knockdown', 'defeated'];
const MOVES: readonly MoveId[] = ['claw', 'tail', 'stomp', 'lunge', 'volley', 'pulse'];
const NO_ENERGY = { energy: 0, spend: () => false };

const _origin = new THREE.Vector3();
const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const _v = new THREE.Vector3();

interface Puppet {
  info: PlayerInfo;
  titan: Titan;
  beam: BeamFx;
  buffer: SnapshotBuffer;
  tag: HTMLDivElement;
  seen: boolean;
}

export interface VersusDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  uiRoot: HTMLElement;
  physics: PhysicsSystem;
  events: GameEventBus;
  player: Titan;
  combat: CombatSystem;
  destruction: DestructionSystem;
  dust: DustSystem;
  fire: DustSystem;
  /** Relocate the local titan (streams the world there). */
  teleport(x: number, z: number, yaw: number): void;
  toast(text: string): void;
  /** Player list or scores changed. */
  onPlayers(): void;
}

/**
 * Versus over a Room: sends the local titan's pose and events, drives the other
 * players' titans as puppets, applies hits they land on us, mirrors their
 * destruction, and handles KOs + respawns. Sim-side calls come from Game.fixedUpdate.
 */
export class Versus {
  private readonly puppets = new Map<number, Puppet>();
  private readonly sample: Sample = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, sprinting: false, state: 'idle', t: 0, side: 1, charge: 0, move: null, beam: null, hp: 1 };
  private readonly pose: RemotePose = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, sprinting: false, state: 'idle', t: 0, side: 1, charge: 0, move: null, beam: null, hp: 1 };
  /** Hits landed this send window, per player id: damage, poise, stun. */
  private readonly pendingHits = new Map<number, [number, number, number]>();
  private tick = 0;
  private lastAttacker = -1;
  private lastHitTime = -Infinity;
  private time = 0;
  private defeatedFor = -1;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(
    readonly room: Room,
    private readonly d: VersusDeps,
  ) {
    for (const p of room.players.values()) if (p.id !== room.myId) this.addPuppet(p);
    room.onMessage((m) => this.receive(m));
    d.combat.remoteHit = (target, damage, poise, stun) => this.queueHit(target, damage, poise, stun);
    this.unsubscribers.push(
      d.events.on('structure:destroyed', (e) => {
        if (e.byPlayer) this.send({ t: 'des', id: room.myId, k: [e.cx, e.cz, e.index] });
      }),
      d.events.on('combat:impact', (e) => {
        if (e.isPlayer) this.send({ t: 'atk', id: room.myId, move: e.move, x: e.x, z: e.z, yaw: e.yaw, r: e.radius });
      }),
      d.events.on('titan:roar', (e) => {
        if (e.isPlayer) this.send({ t: 'roar', id: room.myId, x: e.x, z: e.z });
      }),
    );
  }

  get me(): PlayerInfo | undefined {
    return this.room.players.get(this.room.myId);
  }

  /** Every titan for combat resolution: ours first, then the puppets that have shown up. */
  titans(out: Titan[]): Titan[] {
    out.length = 0;
    out.push(this.d.player);
    for (const p of this.puppets.values()) if (p.seen) out.push(p.titan);
    return out;
  }

  /** Nearest other titan (minimap marker). */
  nearest(): Titan | null {
    let best: Titan | null = null;
    let bestD = Infinity;
    const me = this.d.player.position;
    for (const p of this.puppets.values()) {
      if (!p.seen) continue;
      const dist = p.titan.position.distanceToSquared(me);
      if (dist < bestD) {
        bestD = dist;
        best = p.titan;
      }
    }
    return best;
  }

  /** Joiners start on a ring around the spawn (facing it) so nobody lands inside another titan. */
  startPoint(): { x: number; z: number; yaw: number } | null {
    if (this.room.myId === 0) return null;
    const a = (this.room.myId * Math.PI) / 2 + 0.4;
    const { x, z } = terrain.spawn;
    return { x: x + Math.sin(a) * 700, z: z + Math.cos(a) * 700, yaw: a + Math.PI };
  }

  /** Our look changed on the title screen. */
  setLook(c: TitanChoice): void {
    const m: Message = { t: 'look', id: this.room.myId, titan: c.titan, color: c.color };
    this.room.noteLocal(m);
    this.send(m);
  }

  fixedUpdate(dt: number): void {
    this.time += dt;
    const player = this.d.player;
    this.handleDefeat(dt);
    if (++this.tick % SEND_EVERY_TICKS === 0) {
      this.send({ t: 's', id: this.room.myId, s: this.stateOf(player) });
      for (const [to, [d, p, st]] of this.pendingHits) this.send({ t: 'hit', id: this.room.myId, to, d, p, st });
      this.pendingHits.clear();
    }
    const at = performance.now() / 1000 - INTERP_DELAY;
    for (const p of this.puppets.values()) {
      if (!p.buffer.sample(at, this.sample)) continue;
      if (!p.seen) {
        p.seen = true;
        p.titan.teleport(this.sample.x, this.sample.z, this.sample.yaw);
        p.titan.model.object.visible = true;
      }
      this.toPose(this.sample);
      p.titan.applyRemote(dt, this.pose);
      if (p.titan.combat.isBeamFiring) this.traceBeam(p.titan);
    }
  }

  render(alpha: number, dt: number): void {
    const cam = this.d.camera;
    const w = this.d.uiRoot.clientWidth;
    const h = this.d.uiRoot.clientHeight;
    for (const p of this.puppets.values()) {
      if (!p.seen) continue;
      p.titan.render(alpha, dt);
      p.beam.update(p.titan, dt);
      // Name tag above the head.
      const t = p.titan;
      _v.set(t.renderPosition.x, t.renderPosition.y + t.spec.body.height * 1.15, t.renderPosition.z).project(cam);
      const visible = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      p.tag.style.display = visible ? '' : 'none';
      if (visible) {
        p.tag.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -100%)`;
        p.tag.style.setProperty('--hp', String(Math.max(0, t.combat.health.fraction)));
      }
    }
  }

  get glowing(): boolean {
    for (const p of this.puppets.values()) if (p.beam.glowing) return true;
    return false;
  }

  dispose(): void {
    for (const id of [...this.puppets.keys()]) this.removePuppet(id);
    for (const u of this.unsubscribers) u();
    this.d.combat.remoteHit = null;
    this.room.leave();
  }

  // ------------------------------------------------------------------ wire

  private send(m: Message): void {
    this.room.send(m);
  }

  private stateOf(t: Titan): TitanState {
    const c = t.combat;
    const a = c.action;
    let b: TitanState['b'] = null;
    if (c.isBeamFiring) {
      const o = t.model.mouth.getWorldPosition(_origin);
      b = [o.x, o.y, o.z, c.beamDir.x, c.beamDir.y, c.beamDir.z];
    }
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      p: [r(t.position.x), r(t.position.y), r(t.position.z)],
      y: r(t.motor.yaw),
      v: r(t.motor.speed),
      r: t.motor.sprinting,
      st: t.state,
      a: [r(a.t), a.side, r(a.charge), c.currentMove],
      b,
      hp: r(Math.max(0, c.health.fraction)),
    };
  }

  private toPose(s: Sample): void {
    const p = this.pose;
    p.x = s.x;
    p.y = s.y;
    p.z = s.z;
    p.yaw = s.yaw;
    p.speed = s.speed;
    p.sprinting = s.sprinting;
    p.state = STATES.includes(s.state as TitanAction) ? (s.state as TitanAction) : 'idle';
    p.t = s.t;
    p.side = s.side === -1 ? -1 : 1;
    p.charge = s.charge;
    p.move = MOVES.includes(s.move as MoveId) ? (s.move as MoveId) : null;
    p.beam = s.beam;
    p.hp = s.hp;
  }

  private receive(m: Message): void {
    switch (m.t) {
      case 'joined':
        if (m.player.id !== this.room.myId) {
          this.addPuppet(m.player);
          this.d.toast(`${m.player.name} joined`);
        }
        break;
      case 'left': {
        const p = this.puppets.get(m.id);
        if (p) this.d.toast(`${p.info.name} left`);
        this.removePuppet(m.id);
        break;
      }
      case 'look': {
        const p = this.puppets.get(m.id);
        if (p) this.restyle(p);
        break;
      }
      case 's':
        this.puppets.get(m.id)?.buffer.push(performance.now() / 1000, m.s);
        return;
      case 'atk':
        this.remoteImpact(m.move, m.x, m.z, m.yaw, m.r);
        return;
      case 'roar':
        this.d.events.emit('titan:roar', { x: m.x, z: m.z, radius: 0, stunSeconds: 0, isPlayer: false });
        return;
      case 'des': {
        const p = this.puppets.get(m.id)?.titan.position;
        this.d.destruction.destroyRemote(m.k[0], m.k[1], m.k[2], p?.x ?? 0, p?.z ?? 0);
        return;
      }
      case 'hit':
        if (m.to === this.room.myId) this.takeHit(m.id, m.d, m.p, m.st);
        return;
      case 'ko':
        this.announceKo(m.id, m.by);
        break;
      default:
        return;
    }
    this.d.onPlayers();
  }

  // --------------------------------------------------------------- combat

  private queueHit(target: Titan, damage: number, poise: number, stun: number): void {
    for (const [id, p] of this.puppets) {
      if (p.titan !== target) continue;
      const acc = this.pendingHits.get(id);
      if (acc) {
        acc[0] += damage;
        acc[1] += poise;
        acc[2] = Math.max(acc[2], stun);
      } else this.pendingHits.set(id, [damage, poise, stun]);
      return;
    }
  }

  private takeHit(from: number, damage: number, poise: number, stun: number): void {
    const attacker = this.puppets.get(from)?.titan ?? null;
    const player = this.d.player;
    if (player.state === 'defeated') return;
    if (stun > 0) player.combat.stun(stun);
    if (damage > 0 || poise > 0) {
      this.d.combat.hitTitan(player, attacker, damage, poise);
      this.lastAttacker = from;
      this.lastHitTime = this.time;
    }
  }

  /** Effects of another player's area attack (its damage to us comes as `hit`). */
  private remoteImpact(move: string, x: number, z: number, yaw: number, radius: number): void {
    if (move === 'stomp' || move === 'pulse') this.d.dust.burst(x, terrain.heightAt(x, z), z, DUST.collapse, DUST.maxBurstScale);
    this.d.events.emit('combat:impact', { move: MOVES.includes(move as MoveId) ? (move as MoveId) : 'claw', x, z, yaw, radius, hits: 0, isPlayer: false });
  }

  /** Where a puppet's beam ends here (visual only; its owner deals the damage). */
  private traceBeam(t: Titan): void {
    const c = t.combat;
    const o = t.model.mouth.getWorldPosition(_origin);
    _ray.origin.x = o.x;
    _ray.origin.y = o.y;
    _ray.origin.z = o.z;
    _ray.dir.x = c.beamDir.x;
    _ray.dir.y = c.beamDir.y;
    _ray.dir.z = c.beamDir.z;
    const range = c.cfg.beam.range;
    const hit = this.d.physics.world.castRay(_ray, range, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, t.body);
    let toi = hit ? hit.timeOfImpact : range;
    if (c.beamDir.y < 0) toi = Math.min(toi, (t.position.y - o.y) / c.beamDir.y);
    const end = c.beamEnd;
    end.x = o.x + c.beamDir.x * toi;
    end.y = o.y + c.beamDir.y * toi;
    end.z = o.z + c.beamDir.z * toi;
    end.hit = toi < range;
  }

  // ------------------------------------------------------------ KO + respawn

  private handleDefeat(dt: number): void {
    const player = this.d.player;
    if (player.state !== 'defeated') {
      this.defeatedFor = -1;
      return;
    }
    if (this.defeatedFor < 0) {
      this.defeatedFor = 0;
      const by = this.time - this.lastHitTime < CREDIT_SECONDS && this.puppets.has(this.lastAttacker) ? this.lastAttacker : -1;
      const m: Message = { t: 'ko', id: this.room.myId, by };
      this.room.noteLocal(m);
      this.send(m);
      this.lastAttacker = -1;
      this.d.onPlayers();
      return;
    }
    this.defeatedFor += dt;
    if (this.defeatedFor >= RESPAWN_SECONDS) {
      this.defeatedFor = -1;
      this.respawn();
    }
  }

  private announceKo(id: number, by: number): void {
    const name = (pid: number) => (pid === this.room.myId ? 'You' : this.room.players.get(pid)?.name ?? 'A titan');
    if (by < 0) this.d.toast(id === this.room.myId ? 'You went down' : `${name(id)} went down`);
    else if (by === this.room.myId) this.d.toast(`You defeated ${name(id)}`);
    else this.d.toast(`${name(by)} defeated ${id === this.room.myId ? 'you' : name(id)}`);
  }

  /** Back on your feet far from everyone: the farthest dry street point on a ring. */
  private respawn(): void {
    const me = this.d.player.position;
    const pitch = CITY.blockSize + CITY.streetWidth;
    let best = { x: me.x, z: me.z, score: -Infinity };
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = Math.round((me.x + Math.sin(a) * RESPAWN_DISTANCE) / pitch) * pitch;
      const z = Math.round((me.z + Math.cos(a) * RESPAWN_DISTANCE) / pitch) * pitch;
      if (terrain.isWater(x, z, 3)) continue;
      const map = terrain.map;
      if (map && (x < map.meta.minX + 300 || x > map.maxX - 300 || z < map.meta.minZ + 300 || z > map.maxZ - 300)) continue;
      let nearest = Infinity;
      for (const p of this.puppets.values()) nearest = Math.min(nearest, Math.hypot(p.titan.position.x - x, p.titan.position.z - z));
      if (nearest > best.score) best = { x, z, score: nearest };
    }
    this.d.teleport(best.x, best.z, Math.random() * Math.PI * 2);
    this.d.player.combat.respawn();
  }

  // --------------------------------------------------------------- puppets

  private addPuppet(info: PlayerInfo): void {
    if (this.puppets.has(info.id)) return;
    const d = this.d;
    const { x, z } = terrain.spawn;
    const choice = { titan: info.titan, color: info.color };
    const titan = new Titan(d.physics, d.events, new THREE.Vector3(x, terrain.heightAt(x, z), z), false, NO_ENERGY, { ...PLAYER_SPEC, design: designFor(choice) }, { remote: true });
    titan.model.object.visible = false;
    d.scene.add(titan.model.object);
    const beam = new BeamFx(d.scene, d.fire, colorwayFor(choice).beam);
    const tag = document.createElement('div');
    tag.className = 'versus-tag';
    tag.textContent = info.name;
    d.uiRoot.appendChild(tag);
    this.puppets.set(info.id, { info, titan, beam, buffer: new SnapshotBuffer(), tag, seen: false });
  }

  private restyle(p: Puppet): void {
    const info = this.room.players.get(p.info.id);
    if (!info) return;
    p.info = info;
    const choice = { titan: info.titan, color: info.color };
    p.titan.setDesign(designFor(choice));
    p.titan.model.object.visible = p.seen;
    p.beam.setColors(colorwayFor(choice).beam);
  }

  private removePuppet(id: number): void {
    const p = this.puppets.get(id);
    if (!p) return;
    this.puppets.delete(id);
    this.d.scene.remove(p.titan.model.object);
    p.titan.model.dispose();
    p.titan.dispose();
    p.beam.dispose();
    p.tag.remove();
  }
}
