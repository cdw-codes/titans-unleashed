import * as THREE from 'three';
import { QUALITY_PRESETS, type QualityLevel } from '../config/quality';
import { SIM } from '../config/sim';
import { KAIJU_FEEDBACK } from '../config/kaiju';
import { DUST, SMOKE } from '../config/effects';
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
    scene.add(this.dust.mesh, this.smoke.mesh);
    this.collapse = new CollapseSystem(this.chunks, this.cityPools, this.dust, this.smoke, this.debris);

    const spawn = new THREE.Vector3(CITY.spawnX, 0, CITY.spawnZ);
    this.player = new Kaiju(physics, this.events, spawn, true);
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

    this.loop = new GameLoop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha, frameDelta, step) => this.renderFrame(alpha, frameDelta, step),
    });

    this.destruction = new DestructionSystem(this.chunks, this.collapse, this.debris, this.dust, this.events, {
      hitPause: (s) => this.loop.hitStop(s),
      cameraDistanceTo: (x, z) => Math.hypot(this.render.camera.position.x - x, this.render.camera.position.z - z),
      addTrauma: (a) => this.camera.shake.addTrauma(a),
    });
    this.events.on('structure:destroyed', (e) => this.progress.onDestroyed(e.points, e.size));
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

  spawnTestCrates(count: number): void {
    this.crates.spawn(count, this.player.position);
  }

  private setPaused(paused: boolean): void {
    // Pause = pointer not locked. Rendering continues so the dev GUI stays live.
    this.loop.paused = paused;
    this.pauseOverlay.visible = paused;
    this.crosshair.visible = !paused;
    this.hud.visible = !paused;
    this.events.emit('game:pause', { paused });
  }

  private fixedUpdate(dt: number): void {
    const intent = this.playerController.update(this.input.state, this.camera.yaw);
    this.player.fixedUpdate(dt, intent);
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

    const { dx, dy } = this.input.consumeMouseDelta();
    this.camera.applyMouse(dx, dy);
    const motor = this.player.motor;
    this.camera.update(this.player.renderPosition, visualDt, this.player.state === 'sprint' ? 1 : 0);
    const focus = this.player.renderPosition;
    this.environment.follow(focus, this.render.camera.position);
    this.ground.follow(focus);
    this.water.follow(focus);
    this.chunks.update(focus.x, focus.z, QUALITY_PRESETS[this.qualityLevel].drawDistance);
    this.cityPools.flush();
    this.hud.update(this.progress.score, this.progress.energyFraction);

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
    }
    this.debug.preRender(info);
    this.render.render();
    this.debug.postRender(info);
  }
}
