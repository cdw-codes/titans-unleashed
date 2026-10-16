import * as THREE from 'three';
import { CITY } from '../../config/city';
import { DUST, SHOCKWAVE } from '../../config/effects';
import { ENCOUNTERS } from '../../config/encounters';
import { DESTRUCTION } from '../../config/destruction';
import { RIVALS, type RivalId } from '../../config/rivals';
import { Random } from '../../core/random';
import type { GameEventBus } from '../../core/events';
import { Kaiju } from '../../entities/kaiju/Kaiju';
import type { PlayerController } from '../../entities/kaiju/PlayerController';
import { RivalAI } from '../../entities/rivals/RivalAI';
import { rivalSpec, UNLIMITED_ENERGY } from '../../entities/rivals/rivalSpecs';
import { THORNMAW_DESIGN, VESPERION_DESIGN } from '../../entities/kaiju/designs';
import type { EncounterHud } from '../../ui/EncounterHud';
import type { CameraSystem } from '../CameraSystem';
import type { PhysicsSystem } from '../PhysicsSystem';
import type { ProgressSystem } from '../ProgressSystem';
import { BeamFx } from '../effects/BeamFx';
import type { BarrierFx } from '../effects/BarrierFx';
import type { DustSystem } from '../effects/DustSystem';
import type { ShockwaveFx } from '../effects/ShockwaveFx';
import { EncounterSystem, type EncounterAction } from './EncounterSystem';

interface ActiveRival {
  id: RivalId;
  kaiju: Kaiju;
  ai: RivalAI;
  beam: BeamFx;
}

export interface DirectorDeps {
  scene: THREE.Scene;
  physics: PhysicsSystem;
  events: GameEventBus;
  player: Kaiju;
  controller: PlayerController;
  camera: CameraSystem;
  hud: EncounterHud;
  barrier: BarrierFx;
  dust: DustSystem;
  fire: DustSystem;
  shockwaves: ShockwaveFx;
  progress: ProgressSystem;
  hitPause(seconds: number): void;
}

const BEAM_COLORS: Record<RivalId, { core: number; glow: number }> = {
  thornmaw: { core: 0xffe2c4, glow: THORNMAW_DESIGN.glowColor },
  vesperion: { core: 0xf3dcff, glow: VESPERION_DESIGN.glowColor },
};

/**
 * Runs rival encounters: drives EncounterSystem, spawns and despawns rivals
 * with their AI, keeps both kaiju inside the barrier, handles lock-on, and
 * feeds the encounter HUD.
 */
export class EncounterDirector {
  readonly encounter = new EncounterSystem(ENCOUNTERS);
  rival: ActiveRival | null = null;
  lockOn = false;
  private readonly rng = new Random(Date.now() >>> 0);
  private readonly perceptionTarget = { x: 0, y: 0, z: 0 };
  private readonly lockTarget = { x: 0, y: 0, z: 0, aimHeight: 0 };
  private roarOnce = false;
  private sinkAfter = Infinity;

  constructor(private readonly d: DirectorDeps) {}

  /** Player + active rival, for combat resolution. */
  get kaijus(): Kaiju[] {
    return this.rival ? [this.d.player, this.rival.kaiju] : [this.d.player];
  }

  get rivalAlive(): boolean {
    return !!this.rival && this.rival.kaiju.state !== 'defeated';
  }

  toggleLock(): void {
    this.lockOn = !this.lockOn && this.rivalAlive;
  }

  /** Before the player's tick: lock-on target for strafing and auto-aim. */
  preparePlayer(): void {
    const r = this.rival?.kaiju;
    if (this.lockOn && r && this.rivalAlive) {
      this.lockTarget.x = r.position.x;
      this.lockTarget.y = r.position.y;
      this.lockTarget.z = r.position.z;
      this.lockTarget.aimHeight = r.spec.body.height * 0.6;
      this.d.controller.lockTarget = this.lockTarget;
    } else {
      this.lockOn = false;
      this.d.controller.lockTarget = null;
    }
  }

  fixedUpdateRival(dt: number): void {
    const r = this.rival;
    if (!r) return;
    const k = r.kaiju;
    const p = this.d.player;
    const t = this.perceptionTarget;
    t.x = p.position.x;
    t.y = p.position.y + p.spec.body.height * 0.55;
    t.z = p.position.z;
    const playerDown = p.state === 'defeated';
    r.ai.update(dt, {
      x: k.position.x,
      z: k.position.z,
      yaw: k.yaw,
      busy: k.combat.busy && k.state !== 'beamCharge',
      charging: k.state === 'beamCharge',
      charge: k.combat.charge,
      canStart: (id) => k.combat.canStart(id),
      target: playerDown ? null : t,
    });
    if (this.roarOnce && !k.combat.busy) {
      r.ai.combat.roar = true;
      this.roarOnce = false;
    }
    k.fixedUpdate(dt, r.ai.intent, r.ai.combat);
  }

  /** After both kaiju moved: keep them inside the barrier. */
  constrain(): void {
    const a = this.encounter.arena;
    if (!a.active) return;
    let pushed = false;
    for (const k of this.kaijus) pushed = k.constrain(a.x, a.z, a.radius) || pushed;
    if (pushed) this.d.barrier.flash();
  }

  fixedUpdateEncounter(dt: number): void {
    const p = this.d.player;
    const r = this.rival?.kaiju;
    const actions = this.encounter.update(dt, {
      score: this.d.progress.score,
      playerX: p.position.x,
      playerZ: p.position.z,
      rivalX: r?.position.x ?? p.position.x + this.encounter.dir.x * 1000,
      rivalZ: r?.position.z ?? p.position.z + this.encounter.dir.z * 1000,
      playerDefeated: p.state === 'defeated',
      rivalDefeated: !!r && r.state === 'defeated',
    });
    for (const a of actions) this.handle(a);
  }

  render(alpha: number, dt: number): void {
    const r = this.rival;
    if (r) {
      // Defeated rivals sink away during the outro.
      if (this.encounter.phase === 'outro' && this.encounter.t > this.sinkAfter) {
        r.kaiju.sink += dt * 22;
        if (Math.random() < dt * 6) {
          const pos = r.kaiju.position;
          this.d.dust.burst(pos.x + (Math.random() - 0.5) * 60, 0, pos.z + (Math.random() - 0.5) * 60, DUST.collapse, 1.6);
        }
      }
      r.kaiju.render(alpha, dt);
      r.beam.update(r.kaiju, dt);
    }
    this.d.barrier.update(dt);
    this.d.camera.lockYaw = this.lockOn && r ? Math.atan2(r.kaiju.renderPosition.x - this.d.player.renderPosition.x, r.kaiju.renderPosition.z - this.d.player.renderPosition.z) : null;

    const e = this.encounter;
    const p = this.d.player.renderPosition;
    let compass: { x: number; z: number } | null = null;
    let compassText = '';
    if (e.phase === 'warning') {
      compass = { x: p.x + e.dir.x * 1000, z: p.z + e.dir.z * 1000 };
      compassText = '???';
    } else if (r && this.rivalAlive) {
      compass = r.kaiju.renderPosition;
      compassText = `${Math.round(Math.hypot(compass.x - p.x, compass.z - p.z))} m`;
    }
    this.d.hud.update(dt, {
      bossHealth: r ? r.kaiju.combat.health.fraction : 0,
      compassTarget: compass,
      compassText,
      lockTarget: this.lockOn && r ? { x: r.kaiju.renderPosition.x, y: r.kaiju.renderPosition.y + r.kaiju.spec.body.height * 0.6, z: r.kaiju.renderPosition.z } : null,
      camera: this.d.camera.renderCamera,
      cameraYaw: this.d.camera.yaw,
    });
  }

  get glowing(): boolean {
    return !!this.rival && this.rival.beam.glowing;
  }

  // ------------------------------------------------------------ debug

  /** Spawn a rival right away, close by, and raise the barrier immediately. */
  debugSpawn(id: RivalId): void {
    if (this.rival) this.despawn();
    const p = this.d.player.position;
    const yaw = this.d.player.yaw;
    this.encounter.rival = id;
    this.spawn(id, p.x + Math.sin(yaw) * 300, p.z + Math.cos(yaw) * 300);
    this.encounter.phase = 'approaching';
    this.encounter.t = 0;
  }

  debugDefeatRival(): void {
    this.rival?.kaiju.combat.takeHit(1e6);
  }

  // ------------------------------------------------------------ actions

  private handle(a: EncounterAction): void {
    const hud = this.d.hud;
    switch (a.type) {
      case 'warn': {
        hud.showBanner('SEISMIC ACTIVITY DETECTED', 'warning', ENCOUNTERS.warningSeconds - 1);
        // A distant roar: a shockwave and dust plume on the horizon.
        const p = this.d.player.position;
        const x = p.x + a.dirX * 950;
        const z = p.z + a.dirZ * 950;
        this.d.shockwaves.spawn(x, 2, z, 500, 2.5, SHOCKWAVE.roarColor, SHOCKWAVE.roarOpacity);
        this.d.dust.burst(x, 0, z, DUST.collapse, DUST.maxBurstScale);
        return;
      }
      case 'tremor':
        this.d.camera.shake.addTrauma(a.trauma);
        this.d.camera.shake.addKick(a.trauma * 20);
        return;
      case 'spawn': {
        this.spawn(a.rival, Math.min(a.x, CITY.coastX - 150), a.z);
        const cfg = RIVALS[a.rival];
        hud.showBanner(`${cfg.name} HAS ARRIVED`, 'arrival', 3.5);
        return;
      }
      case 'barrierUp':
        this.d.barrier.raise(a.x, a.z, a.radius);
        this.d.camera.shake.addTrauma(0.3);
        return;
      case 'victory': {
        const cfg = RIVALS[a.rival];
        hud.showBanner(`${cfg.name} DEFEATED`, 'victory', 4.5);
        this.d.progress.score += ENCOUNTERS.victoryPoints;
        this.d.progress.energy = Math.min(this.d.progress.energy + ENCOUNTERS.victoryEnergy, DESTRUCTION.maxEnergy);
        this.d.hitPause(0.25);
        this.d.camera.shake.addTrauma(0.8);
        this.lockOn = false;
        this.sinkAfter = 2;
        return;
      }
      case 'playerDefeated':
        this.roarOnce = true;
        this.lockOn = false;
        this.sinkAfter = 2.8;
        return;
      case 'end':
        this.d.barrier.drop();
        this.despawn();
        return;
    }
  }

  private spawn(id: RivalId, x: number, z: number): void {
    const k = new Kaiju(this.d.physics, this.d.events, new THREE.Vector3(x, 0, z), false, UNLIMITED_ENERGY, rivalSpec(id), { plowsThrough: true });
    // Face the player.
    const p = this.d.player.position;
    k.motor.yaw = k.motor.moveYaw = Math.atan2(p.x - x, p.z - z);
    this.d.scene.add(k.model.object);
    this.rival = {
      id,
      kaiju: k,
      ai: new RivalAI(RIVALS[id].ai, new Random(this.rng.int(1, 1e9))),
      beam: new BeamFx(this.d.scene, this.d.fire, BEAM_COLORS[id]),
    };
    this.sinkAfter = Infinity;
    this.d.hud.setBoss(RIVALS[id].name, RIVALS[id].title);
  }

  private despawn(): void {
    const r = this.rival;
    if (!r) return;
    this.d.scene.remove(r.kaiju.model.object);
    r.beam.dispose();
    r.kaiju.dispose();
    this.rival = null;
    this.lockOn = false;
    this.d.hud.setBoss(null);
  }
}
