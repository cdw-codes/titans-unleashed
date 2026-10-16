# Kaiju Rampage — project memory

## Game
Third-person 3D browser action game. The player is an ORIGINAL giant atomic lizard kaiju
(tail, claws, charged energy beam). Never use Godzilla or any trademarked names/designs.

Core loop: roam a large streamed city → smash buildings/vehicles → grow stronger from
destruction → get ambushed by rival kaiju (energy-barrier arena until one is defeated) →
roam again. Military (tanks, helicopters) harasses and escalates with destruction.

**Design priority above all: feel GIGANTIC and HEAVY.** Slow weighty movement, buildings
crumbling underfoot, camera shake + dust on every step and impact, constant scale cues.
When a choice trades responsiveness against weight, ask; default to weight.

## How we work
- User is an experienced full-stack dev, new to gamedev. No tutorials; explain only real
  tradeoffs. Push back on requests that will cause problems later.
- Work autonomously within a milestone; commit in logical steps with clear messages.
- End of each milestone: STOP. Summarize, how to run, what to playtest, which config
  values to tune. Wait for go-ahead (playtesting is required; feel can't be verified in code).
- Game must be playable at the end of every milestone.
- Flag any feature that risks the frame-rate target BEFORE building it.
- No new runtime dependencies without asking + justifying. Pin exact versions.
  Check installed package source/types when unsure about an API (three r186 removed
  PCFSoftShadowMap; Vite 8 uses rolldown: `rolldownOptions`, `codeSplitting`).
- Tuning loop: the user tunes in the dev panel (Dev → Tuning) and clicks "Save as base", which
  writes the values into `src/config/*.ts` via a dev-server endpoint. Treat uncommitted diffs in
  `src/config` as the user's tuning: review, keep, and commit them — never revert them.
  New config values get sliders automatically; register new config objects in
  `src/debug/tunables.ts` (keep tunable values plain numeric literals so they can be saved).
- Maintain this file at each milestone end and on decisions affecting future code; show
  the user the diff. Keep < ~150 lines; current state, not a changelog. No tuning numbers
  here — those live in `src/config`.

## Tech stack
Three.js (WebGLRenderer) · TypeScript strict (TS 7) · Vite 8 · Rapier
(`@dimforge/rapier3d-compat`, kinematic character controller) · Vitest (pure logic only) ·
lil-gui (dev-only, dynamic import). Commands: `npm run dev | build | test | typecheck`.

## Folder structure
- `src/core` — Game (composition root + update order), GameLoop, FixedStepper, EventBus, events,
  StateMachine, math (damp/Spring/noise), Random (seeded), settings
- `src/world` — environment, ground, water; `city/` (CityGenerator → ChunkSpec data, ChunkManager
  streaming, CityPools, DestructionState); `materials/` (world-space window shader)
- `src/entities` — `kaiju/` (Kaiju, KaijuSpec, KaijuMotor, Gait, KaijuCombat, KaijuModel, designs,
  PlayerController); `rivals/` (RivalAI, rival specs)
- `src/systems` — render, physics, camera, InstancePool, PhysicsInstances, Progress (score/energy),
  `destruction/` (gameplay, Collapse visuals, Debris pool, rules), `combat/` (CombatSystem, rules,
  Health, Projectiles), `encounters/`, `military/` (Threat, MilitarySystem), `progression/`
  (Upgrades → KaijuModifiers), `effects/`
- `src/input` — InputState (pure, tested) + Input (DOM, pointer lock)
- `src/ui` — HUD, menus, overlays, styles.css
- `src/config` — ALL tunable values, typed (sim, quality, camera, input, environment, world, …)
- `src/debug` — F1 debug system, DebugDraw, DebugLabels, dev GUI + tunables registry, test tools
- `tools` — dev-only Node code: Vite tuning-save plugin + config source patcher (tested)
- `src/assets` — ModelLibrary (glTF load + bake for instancing, fallbacks); `public/` holds
  processed assets; `assets-src/` raw downloads (git-ignored)
- Tests sit next to code as `*.test.ts`; keep tested modules DOM-free.

## Architecture rules
- Units: meters, seconds. Kaiju ≈ 100 m tall (`KAIJU_BODY.height`; model authored at 80 m and
  scaled, so foot offsets/dust use `kaiju.scale`). Real gravity (looks slow at this scale — good).
- Footsteps are `kaiju:footstep` events; shake/dust/crushing subscribe.
- Rapier KCC gotchas: never push down while grounded (stalls horizontal motion; rely on
  snap-to-ground); keep static colliders a few km max (huge slabs break precision).
- Placeholder kaiju = primitives rigidly skinned to bones, merged into ONE SkinnedMesh.
  Keep that pattern (1 draw call) until M7 swaps in authored models.
- City = pure deterministic data (`CityGenerator.generate(cx, cz)`, seeded per chunk) rendered
  through GLOBAL instance pools shared by all chunks (never per-chunk meshes: draw calls would
  scale with chunk count). Destroyed state is persisted as (chunk, index), so generation must
  stay deterministic — changing generator code reshuffles indices (fine pre-save-games).
- Structure size classes: `large` (collider + HP, collapses), `small` (houses/shops, crushed on
  contact, no collider), `prop` (cars/trees/containers, near-player only, crushed).
- Every kaiju (player or rival) is the same `Kaiju` class built from a `KaijuSpec` (body,
  movement, gait, combat config, design). Controllers only produce MoveIntent + CombatInput:
  PlayerController from input, RivalAI from perception. Never special-case rivals in Kaiju.
- `KaijuCombat` (pure, tested) turns CombatInput into AttackEvents + a movement allowance;
  `CombatSystem` resolves them against structures and all other kaiju. Structure damage goes
  through `DestructionSystem.damage/crush` with `byPlayer` (only player kills score).
- Rivals plow through buildings: their KCC ignores `GROUP.STRUCTURE` colliders and
  DestructionSystem wrecks what they overlap. No pathfinding — keep it that way.
- Bloom runs only on frames that request it (beam glow); HDR (>1) colors are for FX only.
- Upgrades never mutate configs (the Tuning panel saves those): they produce `KaijuModifiers`
  that systems read at the point of use (`combat.mods`, `motor.speedMultiplier`, ...).
- Military units are kinematic pooled data (no physics bodies), rendered via InstancedMesh;
  collateral from their shots is not credited to the player.
- Gameplay settles destruction at collapse START (persist, remove collider); CollapseSystem is
  visual-only at render rate and tolerates chunks unloading mid-collapse.
- Fixed 60 Hz sim (`GameLoop` → `Game.fixedUpdate`) for physics + gameplay; render at display
  rate with interpolation (`alpha`). Anything moved in the sim stores prev/curr state and
  lerps in `render(alpha)`. Camera/visual-only effects run at render rate.
- Input presses are buffered until a sim tick consumes them; UI toggles use `onImmediateAction`.
- Plain classes + systems, no ECS. Systems talk via typed `EventBus` (`core/events.ts`).
- Kaiju states: idle, walk, sprint, attack, stomp, beamCharge, beamFire, roar, stagger,
  knockdown, defeated. Rival AI: small readable decision system (aggression, reaction delay,
  preferred range), no ML.
- All gameplay values in typed `src/config` files; bindings only in `config/input.ts`.
- Debug (F1): overlay stats, collider wireframes, chunk grid; gameplay code draws hitboxes
  via `debug.draw` and AI labels via `debug.label()` — both are no-ops when debug is off.

## Performance rules (non-negotiable)
- Render capped at 30 FPS (`SIM.renderFpsCap`; 0 = uncapped); sim always 60 Hz. Must hold a
  stable 30 on an integrated-GPU laptop at "medium". Presets low/medium/high in
  `config/quality.ts` stay internal (no player setting); `?quality=` overrides for testing.
- City streams in chunks around the player; fog hides the edge (fog end = draw distance).
- InstancedMesh/BatchedMesh for anything repeated; watch draw calls + tris in F1.
- Destroyed buildings → pooled capped debris → rubble; no runtime fracturing. Pool debris,
  particles, projectiles, units. No per-frame allocations in hot paths.
- Exactly one shadow-casting light (sun); its frustum follows the player, texel-snapped.
- Post-processing only where it earns its cost (beam bloom); off on low.

## Controls
Click canvas = pointer lock; Esc = release + pause. Mouse orbits camera; crosshair = beam aim.
WASD move (camera-relative) · Shift sprint · LMB claw · RMB tail sweep · Space stomp ·
hold E charge beam / release fire · R roar · F Atomic Pulse (unlock) · Q or MMB lock-on · F1 debug.

## Milestones
1–6 done (see status).
7. Art + audio — glTF pipeline, licensed CC0 models, skeletal anim blending, spatial audio, menus, minimap
8. Perf + ship — profiling per preset, loading screen, key remapping, prod build, static-host deploy

## Current status
**Milestone 7 done — awaiting playtest/go-ahead for Milestone 8.**

Done: M1 foundation · M2 kaiju + heavy camera · M3 streamed destructible city · M4 combat ·
M5 rival encounters · M6 military (threat stars, tanks, helicopters) + evolution upgrades,
Atomic Pulse, health regen.

M7: spatial audio (AudioSystem/AudioDirector, real CC0 sounds + music), title/pause/
game-over screens, minimap, asset pipeline (`npm run assets`, docs/ASSETS.md), Kenney cars
(BatchedMesh, culled at 320 m) and Quaternius tank models with code-built fallbacks.

Next (M8): profile each preset (target 30 FPS integrated GPU), loading screen (preload city +
assets, replace the blocking build), key remapping UI over `config/input.ts`, production
build, deploy to a free static host. Consider ffmpeg OGG encoding / Safari audio formats.

Known issues:
- Rapier compat bundle ~1.7 MB gzip (base64 wasm); M8 may switch builds (needs a plugin: ask).
- Camera can still clip into towers in dense downtown (occluder fading not built).
- ~630k tris at medium (pools draw every loaded instance); levers: draw distance,
  propRadius, carDrawDistance, small-pool shadows. Initial city build blocks (M8 loader).
- Camera pivot doesn't follow the body down during knockdown (camera stays high).

Decisions:
- Linear fog (not exp) so fog end exactly matches draw distance / chunk streaming radius.
- F1 debug ships in production builds (needed for M8 perf checks); lil-gui is dev-only.
- No settings UI or persistence; medium preset, 30 FPS cap (saves GPU/heat, not RAM).
- Movement is facing-based (turn-limited, heavy); lock-on switches to strafing.
- Defeat: Respawn relocates the player beyond the fog end from the rival (out of sight), onto a
  street intersection, 5 s invulnerable; barrier drops at once. Rivals also spawn beyond the fog.
- Audio deferred to M7 (user declined placeholder audio).
- Tuning: ship genre-typical defaults; the user tunes from player feedback later.
- Art: kaiju, rivals, buildings, helicopter stay code-built (kaiju anim = procedural skeletal
  with blended layers); downloaded CC0 models for cars and tanks only. Compression: meshopt
  + WebP (no Draco/KTX2 decoders). Thousands of small props: simplify, no shadows, cull by
  distance. Beam = hold to charge/fire, release cancels.
