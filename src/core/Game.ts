import * as THREE from 'three';
import { AUTO_QUALITY, QUALITY_LEVELS, QUALITY_PRESETS, type QualityLevel } from '../config/quality';
import { SIM } from '../config/sim';
import { TITAN_FEEDBACK } from '../config/titan';
import RAPIER from '@dimforge/rapier3d-compat';
import { DUST, FIRE, PLASMA_TRAIL, SHOCKWAVE, SMOKE } from '../config/effects';
import { ENCOUNTERS } from '../config/encounters';
import type { RivalId } from '../config/rivals';
import { COMBAT } from '../config/combat';
import { CITY } from '../config/city';
import { DESTRUCTION } from '../config/destruction';
import { createEventBus, type GameEventBus } from './events';
import { GameLoop } from './GameLoop';
import type { StepResult } from './FixedStepper';
import { loadQualityLevel, qualityForced } from './settings';
import { AutoQuality } from './AutoQuality';
import { Input } from '../input/Input';
import { RenderSystem } from '../systems/RenderSystem';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { DustSystem } from '../systems/effects/DustSystem';
import { Environment } from '../world/Environment';
import { TerrainRenderer } from '../world/terrain/TerrainRenderer';
import { terrain } from '../world/terrain/Terrain';
import { Water } from '../world/Water';
import { CityGenerator, GROUND_CELLS } from '../world/city/CityGenerator';
import { WORLD } from '../config/world';
import { BINDINGS } from '../config/input';
import { damp } from './math';
import { availableMaps, randomSeed, reloadWith, selectedMapId, selectedSeed, updateUrl, type CityMapDef } from '../config/maps';
import { colorwayFor, designFor, parseChoice, rosterTitan, type TitanChoice } from '../entities/titan/roster';
import { CityMap } from '../world/maps/CityMap';
import { CityPools } from '../world/city/CityPools';
import { ChunkManager } from '../world/city/ChunkManager';
import { DestructionState } from '../world/city/DestructionState';
import { DebrisSystem } from '../systems/destruction/DebrisSystem';
import { CollapseSystem } from '../systems/destruction/CollapseSystem';
import { DestructionSystem } from '../systems/destruction/DestructionSystem';
import { ProgressSystem } from '../systems/ProgressSystem';
import { Hud } from '../ui/Hud';
import { CombatSystem } from '../systems/combat/CombatSystem';
import { BeamFx } from '../systems/effects/BeamFx';
import { ShockwaveFx } from '../systems/effects/ShockwaveFx';
import type { PlayerAbility } from '../ui/Hud';
import { PLAYER_SPEC } from '../entities/titan/TitanSpec';
import { ProjectileSystem } from '../systems/combat/ProjectileSystem';
import { BarrierFx } from '../systems/effects/BarrierFx';
import { EncounterDirector } from '../systems/encounters/EncounterDirector';
import { EncounterHud } from '../ui/EncounterHud';
import { MILITARY } from '../config/military';
import { UPGRADES, UPGRADE_CHOICES, type UpgradeId } from '../config/upgrades';
import { MilitarySystem } from '../systems/military/MilitarySystem';
import { Threat } from '../systems/military/Threat';
import { modifiersFor, rollChoices } from '../systems/progression/Upgrades';
import { ThreatHud } from '../ui/ThreatHud';
import { EvolutionOverlay } from '../ui/EvolutionOverlay';
import { AudioSystem } from '../systems/audio/AudioSystem';
import { AudioDirector } from '../systems/audio/AudioDirector';
import { Minimap } from '../ui/Minimap';
import { yieldToBrowser } from './yieldToBrowser';
import { Room, type Hello } from '../net/Room';
import { Versus } from '../net/Versus';
import { parseRoomCode, type WorldInfo } from '../net/protocol';
import { Scoreboard } from '../ui/Scoreboard';
import type { RoomView } from '../ui/menus';

const _camDir = new THREE.Vector3();
const _aimRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const COOLDOWN_IDS: PlayerAbility[] = ['claw', 'tail', 'stomp', 'beam', 'roar', 'pulse'];
import { Titan } from '../entities/titan/Titan';
import { PlayerController } from '../entities/titan/PlayerController';
import { DebugSystem } from '../debug/DebugSystem';
import { TestCrates } from '../debug/TestCrates';
import { GameOverScreen, PauseMenu, TitleScreen, type RunStats } from '../ui/menus';
import { Crosshair } from '../ui/Crosshair';

/** How far inside a city map's data edge the player is held (m). */
const MAP_EDGE = 250;
const NO_INTENT = { x: 0, z: 0, sprint: false };
const _titans: Titan[] = [];

/** How this page booted: the world it shows, and a room joined through an invite. */
interface Boot {
  world: WorldInfo;
  joined: { room: Room; destroyed: [number, number, number][] } | null;
  joinError: string | null;
}

/** Versus display name: kept in the URL (?name=) like the titan choice, never stored. */
function loadName(): string {
  const n = new URLSearchParams(location.search).get('name')?.trim().slice(0, 20);
  return n || `Titan ${100 + Math.floor(Math.random() * 900)}`;
}

/** Composition root: builds systems, owns the update order. */
export class Game {
  readonly events: GameEventBus = createEventBus();
  readonly loop: GameLoop;
  readonly render: RenderSystem;
  readonly environment: Environment;
  readonly debug: DebugSystem;
  readonly player: Titan;
  readonly camera: CameraSystem;
  readonly chunks: ChunkManager;
  readonly progress = new ProgressSystem(DESTRUCTION);
  qualityLevel: QualityLevel;

  private readonly input: Input;
  private readonly playerController = new PlayerController();
  private readonly terrainTiles: TerrainRenderer;
  private readonly water: Water;
  private readonly dust = new DustSystem(DUST);
  private readonly smoke = new DustSystem(SMOKE);
  private readonly fire = new DustSystem(FIRE);
  private readonly shockwaves: ShockwaveFx;
  private readonly beamFx: BeamFx;
  private readonly combatSystem: CombatSystem;
  private readonly projectiles: ProjectileSystem;
  private readonly plasmaTrail = new DustSystem(PLASMA_TRAIL);
  readonly director: EncounterDirector;
  readonly military: MilitarySystem;
  readonly threat = new Threat(MILITARY.threat);
  private readonly threatHud: ThreatHud;
  private readonly evolution: EvolutionOverlay;
  readonly audio = new AudioSystem();
  private readonly audioDirector: AudioDirector;
  private readonly minimap: Minimap;
  /** Upgrades owned this session (count per id). */
  readonly upgrades: Partial<Record<UpgradeId, number>> = {};
  private readonly gameOver: GameOverScreen;
  private readonly title: TitleScreen;
  private started = false;
  private readonly autoQuality = qualityForced() ? null : new AutoQuality(AUTO_QUALITY);
  private lastReactionT = 0;
  private readonly hudState = {
    score: 0, energy: 0, health: 1, charge: 0,
    cooldowns: { claw: 0, tail: 0, stomp: 0, beam: 0, roar: 0, pulse: 0 },
    usable: { claw: true, tail: true, stomp: true, beam: true, roar: true, pulse: true },
    unlocked: { claw: true, tail: true, stomp: true, beam: true, roar: true, pulse: false },
    upgrades: '',
  };
  private readonly cityPools: CityPools;
  private readonly debris: DebrisSystem;
  private readonly collapse: CollapseSystem;
  private readonly destruction: DestructionSystem;
  private readonly crates: TestCrates;
  private readonly pauseMenu: PauseMenu;
  private readonly crosshair: Crosshair;
  private readonly hud: Hud;
  private readonly scoreboard: Scoreboard;
  private readonly uiRoot: HTMLElement;
  /** Versus session while in a room (rivals and the military sit out). */
  versus: Versus | null = null;
  private playerName = loadName();
  private choice: TitanChoice;
  private readonly frameInfo = {
    frameMs: 0, steps: 0, quality: '', focus: new THREE.Vector3(),
    extra: (): string[] => [
      `chunks     ${this.chunks.chunks.size}  (instances ${this.cityPools.totalInstances})`,
      `debris     ${this.debris.count}/${QUALITY_PRESETS[this.qualityLevel].debrisCap}  collapsing ${this.collapse.activeCount}`,
      `particles  dust ${this.dust.count}  smoke ${this.smoke.count}`,
      `score      ${this.progress.score}  energy ${this.progress.energy.toFixed(0)}`,
      `player     hp ${this.player.combat.health.health.toFixed(0)}  poise ${this.player.combat.health.poise.toFixed(0)}  ${this.player.combat.currentMove ?? ''}`,
      `encounter  ${this.director.encounter.phase} ${this.director.encounter.t.toFixed(0)}s  (next in ${Math.max(0, this.director.encounter.roamingDelay - this.director.encounter.t).toFixed(0)}s)`,
      `projectiles ${this.projectiles.count}`,
      `military   threat ${this.threat.level} (heat ${this.threat.heat.toFixed(0)})  tanks ${this.military.tankCount}  helis ${this.military.heliCount}`,
    ],
  };

  private constructor(container: HTMLElement, private readonly physics: PhysicsSystem, maps: readonly CityMapDef[], private readonly boot: Boot) {
    const choice = parseChoice(location.search);
    this.choice = choice;
    this.qualityLevel = loadQualityLevel();
    const preset = QUALITY_PRESETS[this.qualityLevel];

    const uiRoot = document.createElement('div');
    uiRoot.className = 'ui-root';
    this.uiRoot = uiRoot;

    this.render = new RenderSystem(container, preset);
    container.appendChild(uiRoot);
    const scene = this.render.scene;

    this.environment = new Environment(scene, preset);
    this.terrainTiles = new TerrainRenderer(scene, WORLD.chunkSize, GROUND_CELLS, 900);
    this.terrainTiles.nearRadius = preset.propRadius;
    this.water = new Water(scene, preset.drawDistance);
    this.cityPools = new CityPools(scene);
    this.chunks = new ChunkManager(CITY, new CityGenerator(CITY), this.cityPools, physics, new DestructionState(), this.terrainTiles);
    this.chunks.propRadius = preset.propRadius;
    this.cityPools.setSmallShadows(preset.smallShadows);
    this.crates = new TestCrates(scene, physics);
    this.debris = new DebrisSystem(scene, physics, preset.debrisCap);
    scene.add(this.dust.mesh, this.smoke.mesh, this.fire.mesh, this.plasmaTrail.mesh);
    this.shockwaves = new ShockwaveFx(scene);
    this.beamFx = new BeamFx(scene, this.fire);
    this.collapse = new CollapseSystem(this.chunks, this.cityPools, this.dust, this.smoke, this.debris);

    const { x: sx, z: sz } = terrain.spawn;
    const spawn = new THREE.Vector3(sx, terrain.heightAt(sx, sz), sz);
    this.player = new Titan(physics, this.events, spawn, true, this.progress, { ...PLAYER_SPEC, design: designFor(choice) });
    scene.add(this.player.model.object);

    this.input = new Input(this.render.canvas, BINDINGS);
    this.camera = new CameraSystem(this.render.camera, physics);
    this.camera.setTarget(this.player.body, this.player.yaw);
    this.debug = new DebugSystem(scene, this.render.renderer, this.render.camera, physics, uiRoot);
    this.crosshair = new Crosshair(uiRoot);
    this.hud = new Hud(uiRoot);
    this.scoreboard = new Scoreboard(uiRoot);
    const resume = () => {
      this.audio.unlock();
      void this.input.requestLock();
    };
    // A new game in the open world is a new world; a city map just starts over.
    // In a room, "new game" leaves it (and stays in that world).
    const newGame = () => {
      if (this.versus) return this.leaveRoom();
      if (terrain.map) location.reload();
      else reloadWith({ seed: String(randomSeed()) });
    };
    this.pauseMenu = new PauseMenu(uiRoot, terrain.map?.meta.attribution ?? null, resume, newGame);
    this.gameOver = new GameOverScreen(uiRoot, () => this.respawn(), newGame);
    this.title = new TitleScreen(uiRoot, {
      maps,
      currentMap: terrain.map?.meta.id ?? null,
      openSeed: terrain.map ? null : terrain.seed,
      credits: terrain.map?.meta.attribution ?? null,
      choice,
      onStart: () => {
        this.started = true;
        this.title.visible = false;
        resume();
      },
      onTitan: (c) => this.applyTitan(c),
      versus: {
        joined: !!boot.joined,
        name: this.playerName,
        onName: (name) => {
          this.playerName = name;
          updateUrl({ name });
        },
        onHost: () => this.hostRoom(),
        onJoin: (code) => reloadWith({ room: code, map: '', seed: '' }),
        onLeave: () => this.leaveRoom(),
      },
    });
    if (boot.joinError) this.title.setVersusStatus(boot.joinError);

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
      playerHurt: (amount) => {
        this.hud.flashDamage(amount);
        this.events.emit('player:damaged', { amount });
      },
    });
    this.projectiles = new ProjectileSystem(scene, physics, this.chunks, this.destruction, this.fire, this.plasmaTrail, this.combatSystem.onProjectileHit);
    this.combatSystem.projectiles = this.projectiles;
    this.director = new EncounterDirector({
      scene,
      physics,
      events: this.events,
      player: this.player,
      controller: this.playerController,
      camera: this.camera,
      hud: new EncounterHud(uiRoot),
      barrier: new BarrierFx(scene, ENCOUNTERS.barrierHeight),
      dust: this.dust,
      fire: this.fire,
      shockwaves: this.shockwaves,
      progress: this.progress,
      hitPause: (s) => this.loop.hitStop(s),
      hiddenDistance: () => QUALITY_PRESETS[this.qualityLevel].drawDistance * 0.95,
      onEncounterEnd: (victory) => {
        if (victory) this.offerEvolution();
      },
    });
    this.military = new MilitarySystem(scene, physics, this.chunks, this.destruction, this.fire, this.dust, this.smoke, {
      hitPlayer: (damage, poise) => this.combatSystem.hitTitan(this.player, null, damage, poise),
      unitDestroyed: (kind) => {
        const c = kind === 'tank' ? MILITARY.tank : MILITARY.heli;
        this.progress.score += c.points;
        this.progress.unitsDestroyed++;
        this.progress.gainEnergy(c.energy);
        this.threat.addDestruction(c.points);
        if (kind === 'heli') this.camera.shake.addTrauma(0.15);
      },
      explosion: (x, z, size) => {
        const k = this.proximity(x, z, 400);
        this.camera.shake.addTrauma(0.3 * size * k * k);
        this.events.emit('fx:explosion', { x, y: terrain.heightAt(x, z), z, size });
      },
      fired: (kind, x, y, z) => this.events.emit('military:fire', { kind, x, y, z }),
    });
    this.audioDirector = new AudioDirector(this.audio, this.events, {
      player: this.player,
      camera: this.render.camera,
      inEncounter: () => this.director.encounter.phase === 'approaching' || this.director.encounter.phase === 'arena',
      threatLevel: () => this.threat.level,
      heliPositions: (out) => this.military.heliPositions(out),
    });
    this.combatSystem.military = this.military;
    this.threatHud = new ThreatHud(uiRoot);
    this.minimap = new Minimap(uiRoot);
    this.evolution = new EvolutionOverlay(uiRoot);
    this.events.on('structure:destroyed', (e) => {
      if (!e.byPlayer) return;
      this.progress.onDestroyed(e.points, e.size);
      this.threat.addDestruction(e.points);
    });
    this.events.on('encounter:event', (e) => {
      if (e.type === 'victory') this.progress.rivalsDefeated++;
    });
    this.events.on('combat:impact', (e) => {
      if (e.move === 'pulse') {
        const gy = terrain.heightAt(e.x, e.z);
        this.shockwaves.spawn(e.x, gy + 3, e.z, e.radius * 1.2, SHOCKWAVE.duration, SHOCKWAVE.pulseColor, SHOCKWAVE.pulseOpacity);
        this.shockwaves.spawn(e.x, gy + 30, e.z, e.radius * 0.8, SHOCKWAVE.duration * 0.7, SHOCKWAVE.pulseColor, SHOCKWAVE.pulseOpacity * 0.6);
        this.military.blastUnits(e.x, e.z, e.radius, true);
      } else if (e.move === 'stomp') {
        this.shockwaves.spawn(e.x, terrain.heightAt(e.x, e.z) + 1, e.z, e.radius * 1.15, SHOCKWAVE.duration, SHOCKWAVE.stompColor, SHOCKWAVE.stompOpacity);
      } else if (e.move === 'tail') {
        // Dust kicked up along the sweep behind the titan.
        for (const off of [-1.1, -0.5, 0, 0.5, 1.1]) {
          const a = e.yaw + Math.PI + off;
          const dx = e.x + Math.sin(a) * e.radius * 0.7;
          const dz = e.z + Math.cos(a) * e.radius * 0.7;
          this.dust.burst(dx, terrain.heightAt(dx, dz), dz, DUST.crush, 1.6);
        }
      }
    });
    this.events.on('titan:roar', (e) => {
      const gy = terrain.heightAt(e.x, e.z);
      this.shockwaves.spawn(e.x, gy + 2, e.z, SHOCKWAVE.roarRadius, SHOCKWAVE.duration * 1.8, SHOCKWAVE.roarColor, SHOCKWAVE.roarOpacity);
      this.dust.burst(e.x, gy, e.z, DUST.collapse, DUST.maxBurstScale);
    });
    this.events.on('titan:footstep', (e) => {
      this.dust.burst(e.x, e.y, e.z, e.sprinting ? DUST.sprintStep : DUST.walkStep, e.scale);
      if (e.isPlayer) {
        this.military.crushAt(e.x, e.z, DESTRUCTION.footCrushRadius * e.scale);
        this.camera.shake.addTrauma(e.sprinting ? TITAN_FEEDBACK.sprintStepTrauma : TITAN_FEEDBACK.walkStepTrauma);
        this.camera.shake.addKick(e.sprinting ? TITAN_FEEDBACK.sprintStepKick : TITAN_FEEDBACK.walkStepKick);
      } else {
        // Other titans: felt through the ground, fading with distance.
        const k = this.proximity(e.x, e.z, 700);
        this.camera.shake.addTrauma(TITAN_FEEDBACK.walkStepTrauma * k * k);
      }
    });
    this.input.onLockChange((locked) => this.setPaused(!locked));
    this.input.onImmediateAction((action) => {
      if (action === 'debug') this.events.emit('debug:toggle', { enabled: this.debug.toggle() });
    });
    this.render.canvas.addEventListener('click', () => {
      if (!this.started) return;
      resume();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setPaused(true);
    });

    this.render.prewarmPostFx();
    // The chosen titan's beam color, and rivals that don't share its look.
    this.beamFx.setColors(colorwayFor(choice).beam);
    this.director.encounter.excludeRival(rosterTitan(choice.titan).rival);
    this.setPaused(true);
  }

  /**
   * Boot with progress (0..1, label) for the loading screen: physics,
   * audio decoding, then the city around the spawn, built in slices so the page
   * stays responsive.
   */
  static async create(container: HTMLElement, onProgress: (fraction: number, label: string) => void = () => {}): Promise<Game> {
    onProgress(0.02, 'Waking the beast');
    const boot: Boot = { world: { map: null, seed: null }, joined: null, joinError: null };
    const code = parseRoomCode(new URLSearchParams(location.search).get('room') ?? '');
    if (code) {
      onProgress(0.03, `Joining room ${code}`);
      const choice = parseChoice(location.search);
      try {
        boot.joined = await Room.join(code, { name: loadName(), titan: choice.titan, color: choice.color });
      } catch (err) {
        boot.joinError = `Could not join ${code}: ${(err as Error).message}.`;
        updateUrl({ room: '' });
      }
    }
    // A joined room's world is the host's.
    const hostWorld = boot.joined?.room.world;
    const mapId = hostWorld ? hostWorld.map : selectedMapId();
    if (mapId) {
      onProgress(0.05, 'Mapping the city');
      try {
        terrain.setMap(await CityMap.load(mapId));
      } catch (err) {
        console.warn(`[map] ${mapId} unavailable, using the open world`, err);
      }
    }
    if (!terrain.map) {
      const seed = hostWorld ? hostWorld.seed : selectedSeed();
      if (seed !== null) terrain.reseed(seed);
      boot.world = { map: null, seed };
    } else boot.world = { map: terrain.map.meta.id, seed: null };
    const physics = await PhysicsSystem.create(1 / SIM.tickRate);
    onProgress(0.2, 'Tuning the roars');
    const game = new Game(container, physics, await availableMaps(import.meta.env.BASE_URL), boot);
    if (boot.joined) {
      for (const [cx, cz, i] of boot.joined.destroyed) game.chunks.markDestroyed(cx, cz, i);
      game.startVersus(boot.joined.room);
    }
    await game.audio.prepare((done, total) => onProgress(0.2 + 0.25 * (done / total), 'Tuning the roars'));
    await game.buildCity((f) => onProgress(0.45 + 0.55 * f, 'Raising the city'));
    onProgress(1, 'Ready');
    return game;
  }

  // ------------------------------------------------------------------ versus

  /** Open a room for the loaded world (title screen). */
  private async hostRoom(): Promise<void> {
    const room = await Room.host(this.boot.world, this.hello(), () => this.chunks.destroyedEntries());
    this.startVersus(room);
  }

  private hello(): Hello {
    return { name: this.playerName, titan: this.choice.titan, color: this.choice.color };
  }

  /** Enter versus: rivals and the military sit out, other players' titans appear. */
  startVersus(room: Room): void {
    this.director.endForVersus();
    this.threatHud.visible = false;
    this.versus = new Versus(room, {
      scene: this.render.scene,
      camera: this.render.camera,
      uiRoot: this.uiRoot,
      physics: this.physics,
      events: this.events,
      player: this.player,
      combat: this.combatSystem,
      destruction: this.destruction,
      dust: this.dust,
      fire: this.fire,
      teleport: (x, z, yaw) => this.teleportTo(x, z, yaw),
      toast: (t) => this.hud.toast(t),
      onPlayers: () => this.refreshRoom(),
    });
    room.onClosed = (reason) => {
      this.hud.toast(reason);
      this.versus?.dispose();
      this.versus = null;
      updateUrl({ room: '', ...this.worldParams() });
      this.refreshRoom();
    };
    const start = this.versus.startPoint();
    if (start) {
      this.player.teleport(start.x, start.z, start.yaw);
      this.camera.snap(start.yaw);
    }
    this.loop.paused = false;
    this.refreshRoom();
  }

  /** Leave the room: back to playing alone in the same world. */
  private leaveRoom(): void {
    this.versus?.dispose();
    this.versus = null;
    reloadWith({ room: '', ...this.worldParams() });
  }

  /** URL parameters that reload this same world. */
  private worldParams(): Record<string, string> {
    const w = this.boot.world;
    return { map: w.map ?? 'open', seed: w.seed === null ? (w.map ? '' : 'classic') : String(w.seed) };
  }

  private roomView(): RoomView | null {
    const room = this.versus?.room;
    if (!room) return null;
    return {
      code: room.code,
      link: room.link,
      isHost: room.isHost,
      myId: room.myId,
      players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, titan: p.titan, kos: p.kos })),
    };
  }

  private refreshRoom(): void {
    const view = this.roomView();
    this.title.setRoom(view);
    this.scoreboard.update(view);
  }

  /** Stream in every chunk around the spawn, a slice per frame. */
  private async buildCity(onProgress: (fraction: number) => void): Promise<void> {
    const p = this.player.position;
    const draw = QUALITY_PRESETS[this.qualityLevel].drawDistance;
    const total = Math.max(1, this.chunks.missingCount(p.x, p.z, draw));
    for (;;) {
      const missing = this.chunks.missingCount(p.x, p.z, draw);
      onProgress(1 - missing / total);
      if (missing === 0) break;
      this.chunks.update(p.x, p.z, draw, 12);
      await yieldToBrowser();
    }
    this.cityPools.flush();
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
    this.applyLod(preset);
    this.autoQuality?.reset();
    this.events.emit('quality:change', { level });
    if (needsReload) console.info('[quality] Antialiasing changes apply after a reload.');
  }

  /** Debug: hit the player as if by an enemy. */
  hurtPlayer(damage: number): void {
    const r = this.player.combat.takeHit(damage);
    if (r === 'none') return;
    const p = this.player.position;
    this.events.emit('titan:hurt', { reaction: r, isPlayer: true, x: p.x, z: p.z });
    this.camera.shake.addTrauma(r === 'stagger' ? 0.35 : 0.6);
  }

  private applyLod(preset: (typeof QUALITY_PRESETS)[QualityLevel]): void {
    this.chunks.propRadius = preset.propRadius;
    this.terrainTiles.nearRadius = preset.propRadius;
    this.cityPools.setSmallShadows(preset.smallShadows);
  }

  /** Debug: encounters. */
  startEncounter(): void {
    this.director.encounter.forceStart();
  }

  spawnRival(id: RivalId): void {
    this.director.debugSpawn(id);
  }

  defeatRival(): void {
    this.director.debugDefeatRival();
  }

  /** 1 at the camera, 0 at `range` meters or beyond. */
  private proximity(x: number, z: number, range: number): number {
    const c = this.render.camera.position;
    return Math.max(0, 1 - Math.hypot(c.x - x, c.z - z) / range);
  }

  private region: string | null | undefined = undefined;
  private regionTimer = 0;

  /** Announce named regions (Tokyo Bay, Manhattan, ...) as the player walks into them. */
  private updateRegion(dt: number): void {
    this.regionTimer -= dt;
    if (this.regionTimer > 0 || !this.started) return;
    this.regionTimer = 0.5;
    const p = this.player.position;
    const name = terrain.regionAt(p.x, p.z);
    if (name === this.region) return;
    if (name) this.hud.toast(name.toUpperCase());
    this.region = name;
  }

  private updateMinimap(dt: number): void {
    const r = this.versus ? this.versus.nearest() : this.director.rival?.titan;
    const a = this.director.encounter.arena;
    this.minimap.update(dt, {
      playerX: this.player.renderPosition.x,
      playerZ: this.player.renderPosition.z,
      cameraYaw: this.camera.yaw,
      chunks: this.chunks.chunks.values(),
      chunkSize: this.chunks.chunkSize,
      rival: r && r.state !== 'defeated' ? { x: r.renderPosition.x, z: r.renderPosition.z, yaw: r.yaw } : null,
      arena: a.active ? a : null,
      units: (cb) => this.military.forEachUnit(cb),
    });
  }

  private runStats(): RunStats {
    const p = this.progress;
    return { score: p.score, structures: p.destroyed, units: p.unitsDestroyed, rivals: p.rivalsDefeated, time: p.time, threatPeak: p.threatPeak };
  }

  /** After a victory: pick 1 of 3 upgrades. The game pauses while choosing. */
  offerEvolution(): void {
    const ids = rollChoices(this.upgrades, UPGRADE_CHOICES, Math.random);
    if (!ids.length) return;
    document.exitPointerLock();
    this.evolution.show(
      ids.map((id) => ({
        id,
        name: UPGRADES[id].name,
        description: UPGRADES[id].description,
        stack: `${(this.upgrades[id] ?? 0) + 1} / ${UPGRADES[id].maxStacks}`,
      })),
      (id) => {
        this.grantUpgrade(id as UpgradeId);
        this.setPaused(!this.input.isLocked); // shows "click to play" if re-locking is refused
        void this.input.requestLock();
      },
    );
  }

  grantUpgrade(id: UpgradeId): void {
    this.upgrades[id] = (this.upgrades[id] ?? 0) + 1;
    const mods = modifiersFor(this.upgrades);
    this.player.setModifiers(mods);
    this.progress.energyMultiplier = mods.energyGain;
    this.hudState.upgrades = (Object.entries(this.upgrades) as [UpgradeId, number][])
      .map(([k, n]) => (n > 1 ? `${UPGRADES[k].name} ×${n}` : UPGRADES[k].name))
      .join(' · ');
  }

  /** Debug: push the threat up one level. */
  raiseThreat(): void {
    const th = MILITARY.threat.levelThresholds;
    const next = th[Math.min(th.length - 1, this.threat.level)]!;
    this.threat.addDestruction(Math.max(1, next - this.threat.heat));
  }

  private showcaseTime = 0;
  private showcaseLift = 0;

  /** Is the line from the titan's chest to a showcase camera spot blocked by a building? */
  private showcaseBlocked(x: number, y: number, z: number, a: number, dist: number, camY: number): boolean {
    const dx = Math.sin(a) * dist;
    const dy = camY - y;
    const dz = Math.cos(a) * dist;
    const len = Math.hypot(dx, dy, dz);
    _aimRay.origin.x = x;
    _aimRay.origin.y = y;
    _aimRay.origin.z = z;
    _aimRay.dir.x = dx / len;
    _aimRay.dir.y = dy / len;
    _aimRay.dir.z = dz / len;
    return !!this.physics.world.castRay(_aimRay, len, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, this.player.body);
  }

  /**
   * Start screen: a slow orbit framing the titan to the right of the left panel,
   * idling (the simulation is paused until the player begins).
   */
  private showcase(dt: number, alpha: number): void {
    this.showcaseTime += dt;
    this.player.previewTick(dt);
    this.player.render(alpha, dt);
    const cam = this.render.camera;
    const p = this.player.renderPosition;
    const h = this.player.spec.body.height;
    const a = this.player.yaw + 0.55 + Math.sin(this.showcaseTime * 0.12) * 0.35;
    const dist = h * 2.3;
    // Rise until nothing stands between the camera and the titan's chest (dense downtowns).
    let lift = h * 0.55;
    const blocked = (y: number) => this.showcaseBlocked(p.x, p.y + h * 0.6, p.z, a, dist, y) || this.showcaseBlocked(p.x, p.y + h * 0.2, p.z, a, dist, y);
    for (let k = 0; k < 8 && blocked(p.y + lift); k++) lift += h * 0.35;
    this.showcaseLift = damp(this.showcaseLift || lift, lift, 0.4, dt);
    cam.position.set(p.x + Math.sin(a) * dist, p.y + this.showcaseLift, p.z + Math.cos(a) * dist);
    // Aim left of the titan on wide screens so it stands clear of the panel.
    const wide = cam.aspect > 1.1;
    const rx = Math.cos(a);
    const rz = -Math.sin(a);
    const off = wide ? h * 0.75 : 0;
    cam.lookAt(p.x - rx * off, p.y + h * 0.5, p.z - rz * off);
  }

  /** Title-screen titan / colorway choice: live model swap, beam color, rival rotation, URL. */
  private applyTitan(c: TitanChoice): void {
    this.player.setDesign(designFor(c));
    this.beamFx.setColors(colorwayFor(c).beam);
    this.director.encounter.excludeRival(rosterTitan(c.titan).rival);
    updateUrl({ titan: c.titan, color: String(c.color) });
    this.choice = c;
    this.versus?.setLook(c);
  }

  /** Debug: fill beam energy. */
  fillEnergy(): void {
    this.progress.energy = DESTRUCTION.maxEnergy;
  }

  /**
   * Debug: jump to (x, z), landing on the nearest dry street intersection (never inside a
   * building), facing `yaw`. The world around is streamed in at once (a short hitch).
   */
  teleportTo(x: number, z: number, yaw = 0): void {
    const pitch = CITY.blockSize + CITY.streetWidth;
    let tx = Math.round(x / pitch) * pitch;
    let tz = Math.round(z / pitch) * pitch;
    search: for (let ring = 1; ring <= 8 && terrain.isWater(tx, tz, 3); ring++) {
      for (let i = -ring; i <= ring; i++) {
        for (const [dx, dz] of [[i, -ring], [i, ring], [-ring, i], [ring, i]] as const) {
          if (!terrain.isWater(tx + dx * pitch, tz + dz * pitch, 3)) {
            tx += dx * pitch;
            tz += dz * pitch;
            break search;
          }
        }
      }
    }
    this.player.teleport(tx, tz, yaw);
    this.camera.snap(yaw);
    this.chunks.update(tx, tz, QUALITY_PRESETS[this.qualityLevel].drawDistance, Infinity);
    this.cityPools.flush();
  }

  private respawn(): void {
    // Away from the rival, never on top of it: relocate, then rebuild the city there.
    const spot = this.director.respawnSpot();
    this.player.teleport(spot.x, spot.z, spot.yaw);
    this.camera.snap(spot.yaw);
    this.chunks.update(spot.x, spot.z, QUALITY_PRESETS[this.qualityLevel].drawDistance, Infinity);
    this.cityPools.flush();
    this.player.combat.respawn();
    // A fresh start: the military loses track of you.
    this.threat.heat = 0;
    this.gameOver.visible = false;
    void this.input.requestLock();
  }

  spawnTestCrates(count: number): void {
    this.crates.spawn(count, this.player.position);
  }

  private setPaused(paused: boolean): void {
    // Pause = pointer not locked. Rendering continues so the dev GUI stays live.
    // Versus never pauses the world: the others keep playing (your titan just stands).
    this.loop.paused = paused && !this.versus;
    const showPause = paused && this.started && !this.gameOver.isVisible && !this.evolution.isVisible;
    if (showPause) this.pauseMenu.show(this.runStats());
    else this.pauseMenu.visible = false;
    this.crosshair.visible = !paused;
    this.hud.visible = !paused;
    this.threatHud.visible = !paused && !this.versus;
    this.scoreboard.visible = !paused;
    this.minimap.visible = !paused;
    this.audio.setPaused(paused);
    this.events.emit('game:pause', { paused });
  }

  private fixedUpdate(dt: number): void {
    const versus = this.versus;
    if (versus) return this.fixedUpdateVersus(dt, versus);
    if (this.input.state.wasPressed('lockOn')) this.director.toggleLock();
    this.director.preparePlayer();
    const p = this.player.position;
    const intent = this.playerController.update(this.input.state, this.camera.yaw, p.x, p.z);
    this.player.fixedUpdate(dt, intent, this.playerController.combat);
    this.director.fixedUpdateRival(dt);
    this.director.constrain();
    // Real city maps end at their data: an invisible edge, well inside the fog.
    const map = terrain.map;
    if (map) this.player.constrainBox(map.meta.minX + MAP_EDGE, map.meta.minZ + MAP_EDGE, map.maxX - MAP_EDGE, map.maxZ - MAP_EDGE);

    const titans = this.director.titans;
    this.combatSystem.fixedUpdate(dt, titans);
    this.projectiles.fixedUpdate(dt, titans);
    for (const ex of this.projectiles.explosions) {
      const k = this.proximity(ex.x, ex.z, 500);
      this.camera.shake.addTrauma(0.35 * k * k);
      this.events.emit('fx:explosion', { x: ex.x, y: ex.y, z: ex.z, size: 0.6 });
    }
    this.destruction.tick(dt);
    for (const k of titans) this.destruction.fixedUpdate(dt, k);
    this.threat.update(dt);
    this.progress.time += dt;
    this.progress.threatPeak = Math.max(this.progress.threatPeak, this.threat.level);
    this.military.fixedUpdate(dt, this.player, this.threat.level, this.director.encounter.phase !== 'roaming');
    this.military.crushAt(p.x, p.z, this.player.spec.body.capsuleRadius * DESTRUCTION.bodyCrushRadiusScale);
    this.director.fixedUpdateEncounter(dt);
    this.physics.step();
    this.debris.fixedUpdate(dt);
    this.crates.instances.snapshot();
    this.input.state.endTick();
  }

  /**
   * Versus tick: no rivals, no military. Puppets move before combat so this tick's
   * attacks hit them where they are; the world keeps running while a menu is open.
   */
  private fixedUpdateVersus(dt: number, versus: Versus): void {
    const p = this.player.position;
    const playing = this.started && this.input.isLocked;
    const intent = this.playerController.update(this.input.state, this.camera.yaw, p.x, p.z);
    this.player.fixedUpdate(dt, playing ? intent : NO_INTENT, playing ? this.playerController.combat : undefined);
    const map = terrain.map;
    if (map) this.player.constrainBox(map.meta.minX + MAP_EDGE, map.meta.minZ + MAP_EDGE, map.maxX - MAP_EDGE, map.maxZ - MAP_EDGE);
    versus.fixedUpdate(dt);
    const titans = versus.titans(_titans);
    this.combatSystem.fixedUpdate(dt, titans);
    this.destruction.tick(dt);
    this.destruction.fixedUpdate(dt, this.player);
    this.progress.time += dt;
    this.physics.step();
    this.debris.fixedUpdate(dt);
    this.crates.instances.snapshot();
    this.input.state.endTick();
  }

  private renderFrame(alpha: number, frameDelta: number, step: StepResult): void {
    // Visual-only systems use scaled time and freeze while paused.
    const visualDt = this.loop.paused ? 0 : Math.min(frameDelta, SIM.maxFrameDelta) * this.loop.timeScale;
    if (this.autoQuality && this.started && !this.loop.paused && this.autoQuality.sample(frameDelta * 1000)) {
      const i = QUALITY_LEVELS.indexOf(this.qualityLevel);
      if (i > 0) {
        this.setQuality(QUALITY_LEVELS[i - 1]!);
        this.hud.toast(`Graphics lowered to ${this.qualityLevel} to keep the game smooth`);
      }
    }

    this.player.render(alpha, visualDt);
    this.director.render(alpha, visualDt);
    this.versus?.render(alpha, visualDt);
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
    this.projectiles.render(alpha, fxDt);
    this.military.render(alpha, fxDt);
    this.plasmaTrail.update(fxDt);
    this.updateReactions();

    const { dx, dy } = this.input.consumeMouseDelta();
    this.camera.applyMouse(dx, dy);
    const motor = this.player.motor;
    this.camera.update(this.player.renderPosition, visualDt, this.player.state === 'sprint' ? 1 : 0);
    if (!this.started) this.showcase(Math.min(frameDelta, 0.1), alpha);
    this.updateAim();
    const focus = this.player.renderPosition;
    this.environment.follow(focus, this.render.camera.position, visualDt);
    this.water.follow(focus, visualDt);
    this.chunks.update(focus.x, focus.z, QUALITY_PRESETS[this.qualityLevel].drawDistance);
    this.cityPools.flush();
    this.updateHud();
    this.updateMinimap(visualDt);
    this.updateRegion(visualDt);
    this.audioDirector.update();

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
        this.debug.label({ x: s.spec.x, y: s.spec.y + s.spec.height + 5, z: s.spec.z }, `${s.spec.kind} ${s.hp.toFixed(0)}/${s.maxHp.toFixed(0)}`);
      }
      const r = this.director.rival;
      if (r) {
        const rp = r.titan.renderPosition;
        this.debug.label(
          { x: rp.x, y: rp.y + r.titan.spec.body.height + 10, z: rp.z },
          `${r.titan.spec.name} · AI ${r.ai.state} · ${r.titan.state} · hp ${r.titan.combat.health.health.toFixed(0)}`,
        );
      }
      const arena = this.director.encounter.arena;
      if (arena.active) this.debug.draw.sphere({ x: arena.x, y: 0, z: arena.z }, arena.radius, 0x6fd6ff, 64);
      this.drawCombatDebug();
    }
    this.debug.preRender(info);
    const pulsing = this.player.combat.currentMove === 'pulse';
    this.render.render(this.beamFx.glowing || this.director.glowing || !!this.versus?.glowing || this.projectiles.count > 0 || pulsing);
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
    // Beyond the colliders: the ground plane under the player.
    const groundY = this.player.position.y;
    if (_camDir.y < 0) t = Math.min(t, (groundY - cam.position.y) / _camDir.y);
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
      this.dust.burst(p.x - Math.sin(yaw) * d, p.y, p.z - Math.cos(yaw) * d, DUST.collapse, DUST.maxBurstScale);
      this.camera.shake.addTrauma(0.7);
      this.camera.shake.addKick(20);
    }
    this.lastReactionT = down ? a.t : 0;
    // In versus you get back up on your own (Versus respawns you away from the others).
    if (a.kind === 'defeated' && a.t > 1.5 && !this.gameOver.isVisible && !this.versus) {
      this.gameOver.show(this.runStats());
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
      const cost = id === 'beam' ? COMBAT.beam.minEnergyToCharge : id === 'pulse' ? (COMBAT.pulse?.energyCost ?? 0) : 0;
      h.usable[id] = this.progress.energy >= cost;
    }
    h.unlocked.pulse = c.mods.pulse;
    this.hud.update(h);
    this.threatHud.update(this.threat.level, this.threat.progress, this.director.encounter.phase !== 'roaming');
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
