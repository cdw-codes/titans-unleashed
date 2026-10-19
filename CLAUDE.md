# Titans Unleashed — project memory

## Game
Third-person 3D browser action game. The player is an ORIGINAL giant atomic lizard titan
(tail, claws, charged energy beam). Never use Godzilla or any trademarked names/designs.
Naming: the giant creatures are always "titans" (code, UI, docs, commits) — matches the title.

Core loop: roam a large streamed world of real-world-inspired regions (Tokyo Bay main city
with a river, Manhattan island + suspension bridge, London on its river, the Alps, an airport,
a coastal power station) plus procedural towns and countryside → smash buildings/vehicles → grow stronger from destruction → get ambushed by rival
titan (energy-barrier arena until one is defeated) → roam again. Military (tanks,
helicopters) harasses and escalates with destruction. Look: stylized low-poly (flat shading,
warm pastel palette, autumn trees, soft sky, lilac horizon mountains).

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
- `src/world` — Environment (sky, clouds, mountains, sun), Water; `terrain/` (Terrain: the one
  height/biome/town/region function, TerrainRenderer); `city/` (CityGenerator → ChunkSpec,
  Sites = authored set pieces, ChunkManager streaming, CityPools, DestructionState)
- `src/entities` — `titan/` (Titan, TitanSpec, TitanMotor, Gait, TitanCombat, TitanModel, designs,
  PlayerController); `rivals/` (RivalAI, rival specs)
- `src/systems` — render, physics, camera, InstancePool, PhysicsInstances, Progress (score/energy),
  `destruction/` (gameplay, Collapse visuals, Debris pool, rules), `combat/` (CombatSystem, rules,
  Health, Projectiles), `encounters/`, `military/` (Threat, MilitarySystem), `progression/`
  (Upgrades → TitanModifiers), `effects/`
- `src/input` — InputState (pure, tested) + Input (DOM, pointer lock)
- `src/ui` — HUD, menus, overlays, styles.css
- `src/config` — ALL tunable values, typed (sim, quality, camera, input, environment, world, …)
- `src/debug` — F1 debug system, DebugDraw, DebugLabels, dev GUI (tuning, region teleports,
  spawners) + tunables registry, test tools
- `tools` — dev-only Node code: Vite plugin (tuning save + `/__dev/shot` screenshots into
  `.dev-shots/`), config source patcher (tested)
- Tests sit next to code as `*.test.ts`; keep tested modules DOM-free.

## Architecture rules
- Units: m, s. Titan ≈ 100 m (`TITAN_BODY.height`; model authored at 80 m, scaled: offsets use
  `titan.scale`). Real gravity. Footsteps are `titan:footstep` events (shake/dust/crush).
- Rapier KCC gotchas: never push down while grounded (stalls horizontal motion; rely on
  snap-to-ground); keep static colliders a few km max (huge slabs break precision).
- Terrain: `terrain.heightAt(x, z)` (world/terrain/Terrain.ts) is the single source of ground
  height. Never assume y = 0: towns are flat at 0, countryside is not. Structures carry a base
  `y`. Ground = per-chunk tiles in one BatchedMesh + per-chunk Rapier heightfields within the
  physics radius; titans beyond it follow `heightAt` analytically (no colliders there).
  Feet plant on slopes via two-bone leg IK after the walk pose (`TitanModel.plantFeet`).
- Titan = primitives rigidly skinned to bones, merged into ONE SkinnedMesh (1 draw call).
- World = pure deterministic data (`CityGenerator.generate(cx, cz)`, seeded per chunk) rendered
  through GLOBAL instance pools shared by all chunks (never per-chunk meshes: draw calls would
  scale with chunk count). Destroyed state is persisted as (chunk, index), so generation must
  stay deterministic — changing generator code reshuffles indices (fine pre-save-games).
- Layout: `config/regions.ts` places the authored regions, rivers and landmarks; satellite
  towns (jittered grid) fill the rest. Towns have street grids + districts; airport/plant are
  flat sites; other chunks are countryside biomes. Set pieces come from `Sites` (built once,
  handed out per chunk by center). Streets bridge rivers on every other street.
- Structure size classes: `large` (collider + HP, collapses), `small` (houses/shops/barns,
  crushed on contact, no collider), `prop` (cars/trees/containers, near-player only, crushed).
- Every titan (player or rival) is the same `Titan` class built from a `TitanSpec` (body,
  movement, gait, combat config, design). Controllers only produce MoveIntent + CombatInput:
  PlayerController from input, RivalAI from perception. Never special-case rivals in Titan.
- `TitanCombat` (pure, tested) turns CombatInput into AttackEvents + a movement allowance;
  `CombatSystem` resolves them against structures and all other titans. Structure damage goes
  through `DestructionSystem.damage/crush` with `byPlayer` (only player kills score).
- Rivals plow through buildings: their KCC ignores `GROUP.STRUCTURE` colliders and
  DestructionSystem wrecks what they overlap. No pathfinding — keep it that way.
- Bloom only on frames that request it (beam glow); HDR (>1) colors are for FX only.
- Upgrades never mutate configs (the Tuning panel saves those): they produce `TitanModifiers`
  that systems read at the point of use (`combat.mods`, `motor.speedMultiplier`, ...).
- Military units: kinematic pooled data, InstancedMesh; their collateral isn't player-credited.
- Gameplay settles destruction at collapse START (persist, remove collider); CollapseSystem is
  visual-only at render rate and tolerates chunks unloading mid-collapse.
- Fixed 60 Hz sim (`GameLoop` → `Game.fixedUpdate`) for physics + gameplay; render at display
  rate with interpolation (`alpha`). Anything moved in the sim stores prev/curr state and
  lerps in `render(alpha)`. Camera/visual-only effects run at render rate.
- Input presses buffer until a sim tick consumes them (UI toggles: `onImmediateAction`). Plain
  classes + systems, no ECS; systems talk via the typed `EventBus` (`core/events.ts`).
- Titan states: idle/walk/sprint/attack/stomp/beamCharge/beamFire/roar/stagger/knockdown/
  defeated. Rival AI: small readable decision system (no ML).
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

## Current status
All 8 milestones done and published (`cdw-codes/titans-unleashed`; pushing `main` deploys
Pages). Post-launch world overhaul (terrain, towns, countryside, look) done.
**Waiting for the user to playtest the new map locally, then tune** (terrain/environment in
the dev panel). Still to do: playtest on an integrated-GPU laptop.

Known issues:
- Rapier compat bundle ~1.7 MB gzip (base64 wasm); a non-compat build needs a plugin (ask).
- Camera can still clip into towers in dense downtown (occluder fading not built).
- ~300k tris at medium; levers per preset in `config/quality.ts`: drawDistance, propRadius
  (props + full-detail terrain), smallShadows, pixel ratio.
- Not measured on an integrated GPU (AutoQuality steps down).
- Camera pivot doesn't follow the body down during knockdown (camera stays high).
- Chunk generation ~1.5–2 ms each (terrain + rivers); 3 per frame while streaming.

Decisions:
- Linear fog (not exp) so fog end exactly matches draw distance / chunk streaming radius.
- F1 debug ships in production builds (needed for M8 perf checks); lil-gui is dev-only.
- No settings UI at all: medium preset + AutoQuality step-down, 30 FPS cap; no key
  remapping (fixed `BINDINGS` in config/input.ts, shown read-only in the menus). Nothing
  is saved to localStorage.
- Movement is facing-based (turn-limited, heavy); lock-on switches to strafing.
- Defeat: Respawn beyond the fog from the rival, on dry ground at a street-grid point, 5 s
  invulnerable; barrier drops at once. Rivals also spawn beyond the fog.
- Tuning: ship genre-typical defaults; the user tunes from player feedback later.
- Game name: **Titans Unleashed** (repo `titans-unleashed`).
- Art: ALL 3D content is code-built (titan, buildings, terrain, trees, vehicles, military;
  titan anim = procedural skeletal with blended layers). No model files or glTF pipeline; if
  the user supplies models later, add a loader then.
- No third-party assets at all: every sound is a code-synthesized placeholder
  (`systems/audio/synth.ts`); real files in `public/audio` + `files` in config/audio.ts
  override them (docs/ASSETS.md).
- Regions: real geography and names only; buildings/landmarks are original designs. Never
  copy trademarked landmarks or re-create film scenes (user agreed).
- Look reference: the user's "Quiet Ridge" screenshot (stylized autumn valley); Neutral tone
  mapping. Beam = hold to charge/fire, release cancels.
