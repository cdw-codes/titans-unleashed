import * as THREE from 'three';
import { QUALITY_PRESETS, type QualityLevel } from '../config/quality';
import { SIM } from '../config/sim';
import { KAIJU_FEEDBACK } from '../config/kaiju';
import { DUST } from '../config/effects';
import { createEventBus, type GameEventBus } from './events';
import { GameLoop } from './GameLoop';
import type { StepResult } from './FixedStepper';
import { loadQualityLevel, saveQualityLevel } from './settings';
import { Input } from '../input/Input';
import { RenderSystem } from '../systems/RenderSystem';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { DustSystem } from '../systems/effects/DustSystem';
import { Environment } from '../world/Environment';
import { Ground } from '../world/Ground';
import { TestArea } from '../world/TestArea';
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
  qualityLevel: QualityLevel;

  private readonly input: Input;
  private readonly playerController = new PlayerController();
  private readonly ground: Ground;
  private readonly dust = new DustSystem(DUST);
  private readonly crates: TestCrates;
  private readonly pauseOverlay: PauseOverlay;
  private readonly crosshair: Crosshair;
  private readonly frameInfo = { frameMs: 0, steps: 0, quality: '', focus: new THREE.Vector3() };

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
    new TestArea(scene, physics);
    this.crates = new TestCrates(scene, physics);
    scene.add(this.dust.mesh);

    this.player = new Kaiju(physics, this.events, new THREE.Vector3(0, 0, 0), true);
    scene.add(this.player.model.object);

    this.input = new Input(this.render.canvas);
    this.camera = new CameraSystem(this.render.camera, physics);
    this.camera.setTarget(this.player.body, this.player.yaw);
    this.debug = new DebugSystem(scene, this.render.renderer, this.render.camera, physics, uiRoot);
    this.crosshair = new Crosshair(uiRoot);
    this.pauseOverlay = new PauseOverlay(uiRoot, () => void this.input.requestLock());

    this.loop = new GameLoop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha, frameDelta, step) => this.renderFrame(alpha, frameDelta, step),
    });

    this.events.on('kaiju:footstep', (e) => {
      this.dust.burst(e.x, e.y, e.z, e.sprinting ? DUST.sprintStep : DUST.walkStep);
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
    saveQualityLevel(level);
    this.render.applyQuality(preset);
    this.environment.applyQuality(preset);
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
    this.events.emit('game:pause', { paused });
  }

  private fixedUpdate(dt: number): void {
    const intent = this.playerController.update(this.input.state, this.camera.yaw);
    this.player.fixedUpdate(dt, intent);
    this.physics.step();
    this.crates.instances.snapshot();
    this.input.state.endTick();
  }

  private renderFrame(alpha: number, frameDelta: number, step: StepResult): void {
    // Visual-only systems use scaled time and freeze while paused.
    const visualDt = this.loop.paused ? 0 : Math.min(frameDelta, SIM.maxFrameDelta) * this.loop.timeScale;

    this.player.render(alpha, visualDt);
    this.crates.instances.render(alpha);
    this.dust.update(visualDt);

    const { dx, dy } = this.input.consumeMouseDelta();
    this.camera.applyMouse(dx, dy);
    const motor = this.player.motor;
    this.camera.update(this.player.renderPosition, visualDt, this.player.state === 'sprint' ? 1 : 0);
    const focus = this.player.renderPosition;
    this.environment.follow(focus, this.render.camera.position);
    this.ground.follow(focus);

    const info = this.frameInfo;
    info.frameMs = frameDelta * 1000;
    info.steps = step.steps;
    info.quality = this.qualityLevel;
    info.focus.copy(focus);

    if (this.debug.enabled) {
      this.debug.label(
        { x: focus.x, y: focus.y + 95, z: focus.z },
        `PLAYER · ${this.player.state} · ${motor.speed.toFixed(1)} m/s · dust ${this.dust.count}`,
      );
    }
    this.debug.preRender(info);
    this.render.render();
    this.debug.postRender(info);
  }
}
