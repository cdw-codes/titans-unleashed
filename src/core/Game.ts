import * as THREE from 'three';
import { QUALITY_PRESETS, type QualityLevel } from '../config/quality';
import { createEventBus, type GameEventBus } from './events';
import { GameLoop } from './GameLoop';
import type { StepResult } from './FixedStepper';
import { loadQualityLevel, saveQualityLevel } from './settings';
import { Input } from '../input/Input';
import { RenderSystem } from '../systems/RenderSystem';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { Environment } from '../world/Environment';
import { Ground } from '../world/Ground';
import { createReferenceBlocks } from '../world/ReferenceBlocks';
import { DevProxy } from '../entities/DevProxy';
import { DebugSystem } from '../debug/DebugSystem';
import { TestCrates } from '../debug/TestCrates';
import { PauseOverlay } from '../ui/PauseOverlay';
import { SIM } from '../config/sim';

/** Composition root: builds systems, owns the update order. */
export class Game {
  readonly events: GameEventBus = createEventBus();
  readonly loop: GameLoop;
  readonly render: RenderSystem;
  readonly environment: Environment;
  readonly debug: DebugSystem;
  qualityLevel: QualityLevel;

  private readonly input: Input;
  private readonly cameraSystem: CameraSystem;
  private readonly ground: Ground;
  private readonly proxy = new DevProxy();
  private readonly crates: TestCrates;
  private readonly pauseOverlay: PauseOverlay;
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
    createReferenceBlocks(scene, physics);
    scene.add(this.proxy.object);
    this.crates = new TestCrates(scene, physics);

    this.input = new Input(this.render.canvas);
    this.cameraSystem = new CameraSystem(this.render.camera);
    this.debug = new DebugSystem(scene, this.render.renderer, this.render.camera, physics, uiRoot);
    this.pauseOverlay = new PauseOverlay(uiRoot, () => void this.input.requestLock());

    this.loop = new GameLoop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha, frameDelta, step) => this.renderFrame(alpha, frameDelta, step),
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
    this.crates.spawn(count, this.proxy.position);
  }

  private setPaused(paused: boolean): void {
    // Pause = pointer not locked. Rendering continues so the dev GUI stays live.
    this.loop.paused = paused;
    this.pauseOverlay.visible = this.loop.paused;
    this.events.emit('game:pause', { paused: this.loop.paused });
  }

  private fixedUpdate(dt: number): void {
    this.proxy.fixedUpdate(dt, this.input.state, this.cameraSystem.yaw);
    this.physics.step();
    this.crates.instances.snapshot();
    this.input.state.endTick();
  }

  private renderFrame(alpha: number, frameDelta: number, step: StepResult): void {
    this.proxy.render(alpha);
    this.crates.instances.render(alpha);

    const { dx, dy } = this.input.consumeMouseDelta();
    this.cameraSystem.applyMouse(dx, dy);
    const focus = this.proxy.renderPosition;
    this.cameraSystem.update(focus);
    this.environment.follow(focus, this.render.camera.position);
    this.ground.follow(focus);

    const info = this.frameInfo;
    info.frameMs = frameDelta * 1000;
    info.steps = step.steps;
    info.quality = this.qualityLevel;
    info.focus.copy(focus);

    if (this.debug.enabled) {
      this.debug.label({ x: focus.x, y: focus.y + 90, z: focus.z }, 'DEV PROXY · idle');
    }
    this.debug.preRender(info);
    this.render.render();
    this.debug.postRender(info);
  }
}
