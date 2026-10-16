import * as THREE from 'three';
import { QUALITY_PRESETS, type QualityLevel } from '../config/quality';
import { SIM } from '../config/sim';
import { KAIJU_FEEDBACK } from '../config/kaiju';
import RAPIER from '@dimforge/rapier3d-compat';
import { DUST, FIRE, SHOCKWAVE, SMOKE } from '../config/effects';
import { COMBAT } from '../config/combat';
import { CITY } from '../config/city';
import { DESTRUCTION } from '../config/destruction';
import { createEventBus, type GameEventBus } from './events';
import { GameLoop } from './GameLoop';
import type { StepResult } from './FixedStepper';
import { loadQualityLevel } from './settings';
import { Input } from '../input/Input';
import { RenderSystem } from '../systems/RenderSystem';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { DustSystem } from '../systems/effects/DustSystem';
import { Environment } from '../world/Environment';
import { Ground } from '../world/Ground';
import { Water } from '../world/Water';
import { CityGenerator } from '../world/city/CityGenerator';
import { CityPools } from '../world/city/CityPools';
import { ChunkManager } from '../world/city/ChunkManager';
import { DestructionState } from '../world/city/DestructionState';
import { DebrisSystem } from '../systems/destruction/DebrisSystem';
import { CollapseSystem } from '../systems/destruction/CollapseSystem';
import { DestructionSystem } from '../systems/destruction/DestructionSystem';
import { ProgressSystem } from '../systems/ProgressSystem';
import { Hud } from '../ui/Hud';
import { DefeatOverlay } from '../ui/DefeatOverlay';
import { CombatSystem } from '../systems/combat/CombatSystem';
import { BeamFx } from '../systems/effects/BeamFx';
import { ShockwaveFx } from '../systems/effects/ShockwaveFx';
import type { CooldownId } from '../entities/kaiju/KaijuCombat';

const _camDir = new THREE.Vector3();
const _aimRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const COOLDOWN_IDS: CooldownId[] = ['claw', 'tail', 'stomp', 'beam', 'roar'];
import { Kaiju } from '../entities/kaiju/Kaiju';
import { PlayerController } from '../entities/kaiju/PlayerController';
import { DebugSystem } from '../debug/DebugSystem';
import { TestCrates } from '../debug/TestCrates';
import { PauseOverlay } from '../ui/PauseOverlay';
import { Crosshair } from '../ui/Crosshair';

/** Composition root: builds systems, owns the update order. */
export class Game {
  readonly events: GameEventBus = createEventBus();
  readonly loop: GameLoop;
  readonly render: RenderSystem;
  readonly environment: Environment;
  readonly debug: DebugSystem;
  readonly player: Kaiju;
  readonly camera: CameraSystem;
  readonly chunks: ChunkManager;
  readonly progress = new ProgressSystem(DESTRUCTION);
  qualityLevel: QualityLevel;

  private readonly input: Input;
  private readonly playerController = new PlayerController();
  private readonly ground: Ground;
  private readonly water: Water;
  private readonly dust = new DustSystem(DUST);
  private readonly smoke = new DustSystem(SMOKE);
  private readonly fire = new DustSystem(FIRE);
  private readonly shockwaves: ShockwaveFx;
  private readonly beamFx: BeamFx;
  private readonly combatSystem: CombatSystem;
  private readonly defeatOverlay: DefeatOverlay;
  private lastReactionT = 0;
  private readonly hudState = {
    score: 0, energy: 0, health: 1, charge: 0,
    cooldowns: { claw: 0, tail: 0, stomp: 0, beam: 0, roar: 0 },
    usable: { claw: true, tail: true, stomp: true, beam: true, roar: true },
  };
  private readonly cityPools: CityPools;
  private readonly debris: DebrisSystem;
  private readonly collapse: CollapseSystem;
  private readonly destruction: DestructionSystem;
  private readonly crates: TestCrates;
  private readonly pauseOverlay: PauseOverlay;
  private readonly crosshair: Crosshair;
  private readonly hud: Hud;
  private readonly frameInfo = {
    frameMs: 0, steps: 0, quality: '', focus: new THREE.Vector3(),
    extra: (): string[] => [
      `chunks     ${this.chunks.chunks.size}  (instances ${this.cityPools.totalInstances})`,
      `debris     ${this.debris.count}/${QUALITY_PRESETS[this.qualityLevel].debrisCap}  collapsing ${this.collapse.activeCount}`,
      `particles  dust ${this.dust.count}  smoke ${this.smoke.count}`,
      `score      ${this.progress.score}  energy ${this.progress.energy.toFixed(0)}`,
      `player     hp ${this.player.combat.health.health.toFixed(0)}  poise ${this.player.combat.health.poise.toFixed(0)}  ${this.player.combat.currentMove ?? ''}`,
    ],
  };

  private constructor(container: HTMLElement, private readonly physics: PhysicsSystem) {
    this.qualityLevel = loadQualityLevel();
    const preset = QUALITY_PRESETS[this.qualityLevel];

    const uiRoot = document.createElement('div');
    uiRoot.className = 'ui-root';

    this.render = new RenderSystem(container, preset);
    container.appendChild(uiRoot);
    const scene = this.render.scene;

    this.environment = new Environment(scene, preset);
    this.ground = new Ground(scene, physics, this.render.renderer.capabilities.getMaxAnisotropy(), preset.drawDistance);
    this.water = new Water(scene, preset.drawDistance);
    this.cityPools = new CityPools(scene);
    this.chunks = new ChunkManager(CITY, new CityGenerator(CITY), this.cityPools, physics, new DestructionState());
    this.crates = new TestCrates(scene, physics);
    this.debris = new DebrisSystem(scene, physics, preset.debrisCap);
    scene.add(this.dust.mesh, this.smoke.mesh, this.fire.mesh);
    this.shockwaves = new ShockwaveFx(scene);
    this.beamFx = new BeamFx(scene, this.fire);
    this.collapse = new CollapseSystem(this.chunks, this.cityPools, this.dust, this.smoke, this.debris);

    const spawn = new THREE.Vector3(CITY.spawnX, 0, CITY.spawnZ);
    this.player = new Kaiju(physics, this.events, spawn, true, this.progress);
    // Build the city around the spawn before the first frame (blocking; loading screen in M8).
    this.chunks.update(spawn.x, spawn.z, preset.drawDistance, Infinity);
    this.cityPools.flush();
    scene.add(this.player.model.object);

    this.input = new Input(this.render.canvas);
    this.camera = new CameraSystem(this.render.camera, physics);
    this.camera.setTarget(this.player.body, this.player.yaw);
    this.debug = new DebugSystem(scene, this.render.renderer, this.render.camera, physics, uiRoot);
    this.crosshair = new Crosshair(uiRoot);
    this.hud = new Hud(uiRoot);
    this.pauseOverlay = new PauseOverlay(uiRoot, () => void this.input.requestLock());
    this.defeatOverlay = new DefeatOverlay(uiRoot, () => this.respawn());

    this.loop = new GameLoop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha, frameDelta, step) => this.renderFrame(alpha, frameDelta, step),
    });

    this.destruction = new DestructionSystem(this.chunks, this.collapse, this.debris, this.dust, this.events, {
      hitPause: (s) => this.loop.hitStop(s),
      cameraDistanceTo: (x, z) => Math.hypot(this.render.camera.position.x - x, this.render.camera.position.z - z),
      addTrauma: (a) => this.camera.shake.addTrauma(a),
    });
    this.combatSystem = new CombatSystem(physics, this.chunks, this.destruction, this.dust, this.events, {
      hitPause: (s) => this.loop.hitStop(s),
      addTrauma: (a) => this.camera.shake.addTrauma(a),
      addKick: (v) => this.camera.shake.addKick(v),
    });
    this.events.on('structure:destroyed', (e) => this.progress.onDestroyed(e.points, e.size));
    this.events.on('combat:impact', (e) => {
      if (e.move === 'stomp') {
        this.shockwaves.spawn(e.x, 1, e.z, e.radius * 1.15, SHOCKWAVE.duration, SHOCKWAVE.stompColor, SHOCKWAVE.stompOpacity);
      } else if (e.move === 'tail') {
        // Dust kicked up along the sweep behind the kaiju.
        for (const off of [-1.1, -0.5, 0, 0.5, 1.1]) {
          const a = e.yaw + Math.PI + off;
          this.dust.burst(e.x + Math.sin(a) * e.radius * 0.7, 0, e.z + Math.cos(a) * e.radius * 0.7, DUST.crush, 1.6);
        }
      }
    });
    this.events.on('kaiju:roar', (e) => {
      this.shockwaves.spawn(e.x, 2, e.z, SHOCKWAVE.roarRadius, SHOCKWAVE.duration * 1.8, SHOCKWAVE.roarColor, SHOCKWAVE.roarOpacity);
      this.dust.burst(e.x, 0, e.z, DUST.collapse, DUST.maxBurstScale);
    });
    this.events.on('kaiju:footstep', (e) => {
      this.dust.burst(e.x, e.y, e.z, e.sprinting ? DUST.sprintStep : DUST.walkStep, e.scale);
      if (e.isPlayer) {
        this.camera.shake.addTrauma(e.sprinting ? KAIJU_FEEDBACK.sprintStepTrauma : KAIJU_FEEDBACK.walkStepTrauma);
        this.camera.shake.addKick(e.sprinting ? KAIJU_FEEDBACK.sprintStepKick : KAIJU_FEEDBACK.walkStepKick);
      }
    });
    this.input.onLockChange((locked) => this.setPaused(!locked));
    this.input.onImmediateAction((action) => {
      if (action === 'debug') this.events.emit('debug:toggle', { enabled: this.debug.toggle() });
    });
    this.render.canvas.addEventListener('click', () => void this.input.requestLock());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setPaused(true);
    });

    this.render.prewarmPostFx();
    this.setPaused(true);
  }

  static async create(container: HTMLElement): Promise<Game> {
    const physics = await PhysicsSystem.create(1 / SIM.tickRate);
    return new Game(container, physics);
  }

  start(): void {
    this.loop.start();
  }

  setQuality(level: QualityLevel): void {
    const preset = QUALITY_PRESETS[level];
    const needsReload = preset.antialias !== this.render.antialias;
    this.qualityLevel = level;
    this.render.applyQuality(preset);
    this.environment.applyQuality(preset);
    this.debris.setCap(preset.debrisCap);
    this.events.emit('quality:change', { level });
    if (needsReload) console.info('[quality] Antialiasing changes apply after a reload.');
  }

  /** Debug: hit the player as if by an enemy. */
  hurtPlayer(damage: number): void {
    const r = this.player.combat.takeHit(damage);
    if (r === 'none') return;
    const p = this.player.position;
    this.events.emit('kaiju:hurt', { reaction: r, isPlayer: true, x: p.x, z: p.z });
    this.camera.shake.addTrauma(r === 'stagger' ? 0.35 : 0.6);
  }

  /** Debug: fill beam energy. */
  fillEnergy(): void {
    this.progress.energy = DESTRUCTION.maxEnergy;
  }

  private respawn(): void {
    this.player.combat.respawn();
    this.defeatOverlay.visible = false;
    void this.input.requestLock();
  }

  spawnTestCrates(count: number): void {
    this.crates.spawn(count, this.player.position);
  }

  private setPaused(paused: boolean): void {
    // Pause = pointer not locked. Rendering continues so the dev GUI stays live.
    this.loop.paused = paused;
    this.pauseOverlay.visible = paused && !this.defeatOverlay.isVisible;
    this.crosshair.visible = !paused;
    this.hud.visible = !paused;
    this.events.emit('game:pause', { paused });
  }

  private fixedUpdate(dt: number): void {
    const intent = this.playerController.update(this.input.state, this.camera.yaw);
    this.player.fixedUpdate(dt, intent, this.playerController.combat);
    this.combatSystem.fixedUpdate(dt, this.player);
    this.destruction.fixedUpdate(dt, this.player);
    this.physics.step();
    this.debris.fixedUpdate(dt);
    this.crates.instances.snapshot();
    this.input.state.endTick();
  }

  private renderFrame(alpha: number, frameDelta: number, step: StepResult): void {
    // Visual-only systems use scaled time and freeze while paused.
    const visualDt = this.loop.paused ? 0 : Math.min(frameDelta, SIM.maxFrameDelta) * this.loop.timeScale;

    this.player.render(alpha, visualDt);
    this.crates.instances.render(alpha);
    this.debris.render(alpha);
    // Visual effects crawl during hit-pause instead of freezing outright.
    const fxDt = this.loop.inHitStop ? visualDt * 0.15 : visualDt;
    this.collapse.update(fxDt);
    this.dust.update(fxDt);
    this.smoke.update(fxDt);
    this.fire.update(fxDt);
    this.shockwaves.update(fxDt);
    this.beamFx.update(this.player, fxDt);
    this.updateReactions();

    const { dx, dy } = this.input.consumeMouseDelta();
    this.camera.applyMouse(dx, dy);
    const motor = this.player.motor;
    this.camera.update(this.player.renderPosition, visualDt, this.player.state === 'sprint' ? 1 : 0);
    this.updateAim();
    const focus = this.player.renderPosition;
    this.environment.follow(focus, this.render.camera.position);
    this.ground.follow(focus);
    this.water.follow(focus);
    this.chunks.update(focus.x, focus.z, QUALITY_PRESETS[this.qualityLevel].drawDistance);
    this.cityPools.flush();
    this.updateHud();

    const info = this.frameInfo;
    info.frameMs = frameDelta * 1000;
    info.steps = step.steps;
    info.quality = this.qualityLevel;
    info.focus.copy(focus);

    if (this.debug.enabled) {
      this.debug.label(
        { x: focus.x, y: focus.y + 95, z: focus.z },
        `PLAYER · ${this.player.state} · ${motor.speed.toFixed(1)} m/s`,
      );
      for (const s of this.destruction.recentlyDamaged) {
        if (s.state !== 'intact' || !this.chunks.isLoaded(s.chunk)) {
          this.destruction.recentlyDamaged.delete(s);
          continue;
        }
        this.debug.label({ x: s.spec.x, y: s.spec.height + 5, z: s.spec.z }, `${s.spec.kind} ${s.hp.toFixed(0)}/${s.maxHp.toFixed(0)}`);
      }
      this.drawCombatDebug();
    }
    this.debug.preRender(info);
    this.render.render(this.beamFx.glowing);
    this.debug.postRender(info);
  }

  /** Crosshair → world point the beam aims at (raycast from the camera, ignoring the player). */
  private updateAim(): void {
    const cam = this.render.camera;
    cam.getWorldDirection(_camDir);
    _aimRay.origin.x = cam.position.x;
    _aimRay.origin.y = cam.position.y;
    _aimRay.origin.z = cam.position.z;
    _aimRay.dir.x = _camDir.x;
    _aimRay.dir.y = _camDir.y;
    _aimRay.dir.z = _camDir.z;
    const max = COMBAT.beam.range + 400;
    const hit = this.physics.world.castRay(_aimRay, max, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, this.player.body);
    let t = hit ? hit.timeOfImpact : max;
    if (_camDir.y < 0) t = Math.min(t, -cam.position.y / _camDir.y);
    const aim = this.playerController.aimPoint;
    aim.x = cam.position.x + _camDir.x * t;
    aim.y = cam.position.y + _camDir.y * t;
    aim.z = cam.position.z + _camDir.z * t;
    this.playerController.hasAim = true;
  }

  /** Knockdown landing thud and the defeat screen. */
  private updateReactions(): void {
    const a = this.player.combat.action;
    const down = a.kind === 'knockdown' || a.kind === 'defeated';
    if (down && this.lastReactionT < 0.55 && a.t >= 0.55) {
      const p = this.player.position;
      const yaw = this.player.yaw;
      // The body lands behind the feet.
      const d = 55 * this.player.scale;
      this.dust.burst(p.x - Math.sin(yaw) * d, 0, p.z - Math.cos(yaw) * d, DUST.collapse, DUST.maxBurstScale);
      this.camera.shake.addTrauma(0.7);
      this.camera.shake.addKick(20);
    }
    this.lastReactionT = down ? a.t : 0;
    if (a.kind === 'defeated' && a.t > 1.5 && !this.defeatOverlay.isVisible) {
      this.defeatOverlay.visible = true;
      document.exitPointerLock();
    }
  }

  private updateHud(): void {
    const c = this.player.combat;
    const h = this.hudState;
    h.score = this.progress.score;
    h.energy = this.progress.energyFraction;
    h.health = c.health.fraction;
    h.charge = this.player.state === 'beamCharge' ? c.charge : 0;
    for (const id of COOLDOWN_IDS) {
      h.cooldowns[id] = c.cooldowns.remainingFraction(id, c.cooldownTotal(id));
      h.usable[id] = id === 'beam' ? this.progress.energy >= COMBAT.beam.minEnergyToCharge : true;
    }
    this.hud.update(h);
    this.crosshair.charge = h.charge;
  }

  /** Attack arcs (fading) and the beam ray. */
  private drawCombatDebug(): void {
    const area = this.combatSystem.lastArea;
    if (area && area.age < 0.6) {
      const color = 0xff3b30;
      const half = (area.arcDeg * Math.PI) / 360;
      const center = area.yaw + (area.arcOffsetDeg * Math.PI) / 180;
      const y = 3;
      const seg = 24;
      let prev = { x: area.x, y, z: area.z };
      for (let i = 0; i <= seg; i++) {
        const ang = center - half + (2 * half * i) / seg;
        const pt = { x: area.x + Math.sin(ang) * area.radius, y, z: area.z + Math.cos(ang) * area.radius };
        if (i === 0 || (area.arcDeg < 360 && i === seg)) this.debug.draw.line({ x: area.x, y, z: area.z }, pt, color);
        if (i > 0) this.debug.draw.line(prev, pt, color);
        prev = pt;
      }
    }
    const c = this.player.combat;
    if (c.isBeamFiring) {
      const o = this.player.model.mouth.getWorldPosition(_camDir);
      this.debug.draw.line(o, c.beamEnd, 0x00e5ff);
      this.debug.draw.sphere(c.beamEnd, COMBAT.beam.impactRadius, 0x00e5ff, 12);
    }
  }
}
