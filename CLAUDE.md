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
- `src/entities` — `kaiju/` (Kaiju body, KaijuMotor, Gait, KaijuModel, PlayerController), rivals, military
- `src/systems` — render, physics, camera, InstancePool, PhysicsInstances, Progress (score/energy),
  `destruction/` (Destruction gameplay, Collapse visuals, Debris pool, damage rules), `effects/`
- `src/input` — InputState (pure, tested) + Input (DOM, pointer lock)
- `src/ui` — HUD, menus, overlays, styles.css
- `src/config` — ALL tunable values, typed (sim, quality, camera, input, environment, world, …)
- `src/debug` — F1 debug system, DebugDraw, DebugLabels, dev GUI + tunables registry, test tools
- `tools` — dev-only Node code: Vite tuning-save plugin + config source patcher (tested)
- `src/assets` — asset loading (M7)
- Tests sit next to code as `*.test.ts`; keep tested modules DOM-free.

## Architecture rules
- Units: meters, seconds. Kaiju ≈ 100 m tall (`KAIJU_BODY.height`; model authored at 80 m and
  scaled, so foot offsets/dust use `kaiju.scale`). Real gravity (looks slow at this scale — good).
- Kaiju bodies take a `MoveIntent` (world dir + sprint); player input and rival AI both just
  produce intents. Footsteps are `kaiju:footstep` events; shake/dust/crushing subscribe.
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
- Gameplay settles destruction at collapse START (persist, remove collider); CollapseSystem is
  visual-only at render rate and tolerates chunks unloading mid-collapse.
- Fixed 60 Hz sim (`GameLoop` → `Game.fixedUpdate`) for physics + gameplay; render at display
  rate with interpolation (`alpha`). Anything moved in the sim stores prev/curr state and
  lerps in `render(alpha)`. Camera/visual-only effects run at render rate.
- Input presses/releases are buffered until a sim tick consumes them (`InputState.endTick`).
  UI toggles (F1) use `Input.onImmediateAction`.
- Plain classes + systems, no ECS. Systems talk via typed `EventBus` (`core/events.ts`).
- Kaiju (player and rivals) use explicit state machines: idle, walk, sprint, attack, stomp,
  beam-charge, beam-fire, roar, stagger, knockdown, defeated.
- Rival AI: small readable decision system with tunable aggression / reaction delay /
  preferred range. No ML.
- All gameplay values in typed `src/config` files; bindings only in `config/input.ts`.
- Debug (F1): overlay stats, collider wireframes, chunk grid; gameplay code draws hitboxes
  via `debug.draw` and AI labels via `debug.label()` — both are no-ops when debug is off.

## Performance rules (non-negotiable)
- Render capped at 30 FPS (`SIM.renderFpsCap`; 0 = uncapped); sim always 60 Hz. Must hold a
  stable 30 on an integrated-GPU laptop at "medium". Presets low/medium/high in
  `config/quality.ts` stay internal (no player setting); `?quality=` overrides for testing.
- City streams in chunks around the player; fog hides the edge (fog end = draw distance).
- InstancedMesh for anything repeated. Watch draw calls in F1 overlay.
- Buildings are static colliders until destroyed → pooled debris bodies under a hard global
  cap → static rubble or fade. No runtime mesh fracturing.
- Pool debris, particles, projectiles, military units. No per-frame allocations in hot paths
  (reuse module-level temp vectors).
- Exactly one shadow-casting light (sun); its frustum follows the player, texel-snapped.
- Post-processing only where it earns its cost (beam bloom); off on low.

## Controls
Click canvas = pointer lock; Esc = release + pause. Mouse orbits camera; crosshair = beam aim.
WASD move (camera-relative) · Shift sprint · LMB claw · RMB tail sweep · Space stomp ·
hold E charge beam / release fire · R roar · Q or MMB lock-on · F1 debug.

## Milestones
1. Foundation — tooling, fixed-step loop, renderer/lighting/fog/ground, presets, F1 debug, this file
2. Kaiju controller — primitive lizard, Rapier KCC, weighty movement, 3rd-person camera w/ collision, step shake + dust, scale test area
3. City + destruction — chunk-streamed seeded procedural city (4 districts), instancing, destructible buildings, pooled debris/rubble, dust/smoke, hit-pause, crush small structures, score + energy
4. Combat — claw, tail, stomp, beam (+bloom), roar; cooldowns/energy; health + hit reactions; HUD; damage unit tests
5. Rival encounters — timer/destruction trigger, warnings, barrier arena, lock-on, 2 rivals (brawler, ranged), win/lose flow
6. Military + progression — escalating tanks/helicopters; upgrades from defeated rivals
7. Art + audio — glTF pipeline, licensed CC0 models, skeletal anim blending, spatial audio, menus, minimap
8. Perf + ship — profiling per preset, loading screen, key remapping, prod build, static-host deploy

## Current status
**Milestone 3 done — awaiting playtest/go-ahead for Milestone 4.**

Done: M1 foundation (loop, renderer, presets, F1 debug); M2 kaiju (motor, gait, KCC, skinned
model, heavy camera, dust); M3 streamed destructible city (generator, shared pools, LOD radii,
damage/crushing, collapse + debris + rubble + smoke, hit-pause, score/energy HUD).

Next (M4): combat moves (claw, tail, stomp, beam, roar) as damage sources into the same
`DestructionSystem.damage` path; player health; HUD health bar; spend energy on the beam.

Known issues:
- Rapier compat bundle is ~1.7 MB gzip (base64 wasm). Revisit in M8 (non-compat build
  with a separate .wasm needs a Vite wasm plugin → ask before adding).
- Camera collision clamps at minDistance; in dense downtown it can still clip into towers.
  Fallback: fade occluding buildings (needs per-instance opacity) — not built yet.
- Global pools draw every loaded instance (no per-instance culling): ~550k tris at medium.
  Watch on integrated GPUs; levers are draw distance, propRadius, shadow casting of small pools.
- Initial city build is blocking (~270 chunks) — loading screen in M8.
- Big dust/smoke puffs are overdraw-heavy; capped by `DUST.maxBurstScale`.
- Hidden browser tabs throttle rAF to ~2 FPS; sim correctly runs slow then (not a bug).
- Changing quality to/from "low" toggles MSAA, which only applies after reload.

Decisions:
- 1 unit = 1 m; kaiju ≈ 100 m; real gravity for heavy-feeling debris.
- Linear fog (not exp) so fog end exactly matches draw distance / chunk streaming radius.
- F1 debug ships in production builds (needed for M8 perf checks); lil-gui is dev-only.
- No settings/preferences UI or persistence; medium preset, 30 FPS cap (cap saves GPU/heat,
  not RAM).
- Movement is facing-based (tank-like): the body turns toward the wished direction at a
  limited rate and withholds speed while misaligned. Lock-on strafing comes in M5.
- Defeat (M5): show a defeat screen with a Respawn option; no game-over/run reset for now.
