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
- Maintain this file at each milestone end and on decisions affecting future code; show
  the user the diff. Keep < ~150 lines; current state, not a changelog. No tuning numbers
  here — those live in `src/config`.

## Tech stack
Three.js (WebGLRenderer) · TypeScript strict (TS 7) · Vite 8 · Rapier
(`@dimforge/rapier3d-compat`, kinematic character controller) · Vitest (pure logic only) ·
lil-gui (dev-only, dynamic import). Commands: `npm run dev | build | test | typecheck`.

## Folder structure
- `src/core` — Game (composition root + update order), GameLoop, FixedStepper, EventBus, events, settings
- `src/world` — environment (sky/sun/fog), ground, chunks, city generation
- `src/entities` — kaiju, rivals, military, vehicles
- `src/systems` — render, physics, camera, combat, destruction, encounters, spawning, audio
- `src/input` — InputState (pure, tested) + Input (DOM, pointer lock)
- `src/ui` — HUD, menus, overlays, styles.css
- `src/config` — ALL tunable values, typed (sim, quality, camera, input, environment, world, …)
- `src/debug` — F1 debug system, DebugDraw, DebugLabels, dev GUI, test tools
- `src/assets` — asset loading (M7)
- Tests sit next to code as `*.test.ts`; keep tested modules DOM-free.

## Architecture rules
- Units: meters, seconds. Kaiju ≈ 80 m tall; real gravity (looks slow at this scale — good).
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
- Stable 60 FPS on integrated-GPU laptop at "medium". Presets low/medium/high in
  `config/quality.ts` (pixel ratio, shadows, draw distance, debris cap, post-fx).
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
**Milestone 1 done — awaiting playtest/go-ahead for Milestone 2.**

Done: tooling; FixedStepper/GameLoop; RenderSystem; Environment (sky dome, sun with
following snapped shadow, hemi fill, fog); recentering grid ground + slab collider; static
instanced reference blocks; PhysicsInstances (interpolated instanced bodies, debris base);
Input + pause overlay; F1 debug; dev GUI; DevProxy capsule + basic orbit camera.

Next (M2): replace `entities/DevProxy` and `systems/CameraSystem` with the kaiju, Rapier
KCC, smoothed camera with collision, footstep shake + dust; delete `debug/TestCrates`
usage from Game once debris exists (keep the tool).

Known issues:
- Rapier compat bundle is ~1.7 MB gzip (base64 wasm). Revisit in M8 (non-compat build
  with a separate .wasm needs a Vite wasm plugin → ask before adding).
- DevProxy has no collision (walks through blocks) — intentional, M2 replaces it.
- Changing quality to/from "low" toggles MSAA, which only applies after reload.

Decisions:
- 1 unit = 1 m; kaiju ≈ 80 m; real gravity for heavy-feeling debris.
- Linear fog (not exp) so fog end exactly matches draw distance / chunk streaming radius.
- F1 debug ships in production builds (needed for M8 perf checks); lil-gui is dev-only.
- Quality precedence: `?quality=` URL param > saved choice > medium.
