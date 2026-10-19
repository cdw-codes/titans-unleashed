# Assets

The game ships **no third-party art or sound**. Everything is generated in code:

- **3D:** titans, buildings, terrain, trees, vehicles and military units are built from
  primitives at load time (`src/entities/titan`, `src/world`, `src/systems/military`).
- **Sound:** every sound is a code-synthesized placeholder (`src/systems/audio/synth.ts`),
  rendered into audio buffers while the game loads.

## Replacing placeholder sounds

1. Put the files in `public/audio/` (OGG or MP3; MP3 also plays in Safari).
2. List them in `files` for the sound in `src/config/audio.ts`; one is picked at random per
   play. A sound with loadable files uses them; otherwise it falls back to its `synth`.
3. Check the license allows use and redistribution, and add credits to the menus if needed.

## Replacing code-built models

There is no model loader. If you want authored models, ask first: it needs a glTF loader,
an asset pipeline and instancing support again (removed on purpose to keep one style).

## Map data (OpenStreetMap)

Real cities come from OpenStreetMap through the Overpass API (`tools/osm/fetchCity.ts`,
raw downloads cached in `tools/osm/cache/`, git-ignored) and are baked by
`tools/osm/bakeCity.ts` into `public/maps/<id>.json` + `.bin`. License: ODbL — the game
shows "Map data © OpenStreetMap contributors (ODbL)" on the title and pause screens, and
the baked files are a derivative database under the ODbL. Keep both if you redistribute.
