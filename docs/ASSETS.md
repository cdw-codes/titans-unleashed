# Assets to download (Milestone 7)

Everything below was checked on the source page on 2026-10-16. Put each download into
`assets-src/` (zips as-is). Raw files stay out of git; the processed, compressed versions go
to `public/` and are committed.

Decisions: kaiju, rivals, buildings and the helicopter stay code-built (original designs,
true scale, ~25 draw calls for the city). Downloaded models replace cars and tanks.

**Pipeline:** put downloads in `assets-src/`, run `npm run assets`. The script
(`tools/build-assets.mjs`) holds the exact file lists: cars are merged into one meshopt +
WebP `cars.glb` (simplified), tanks compressed, sounds copied, big WAVs downmixed to mono
(no ffmpeg here — installing it would allow proper OGG encoding). Sound ids → files live
in `src/config/audio.ts`; model files in `src/config/models.ts`.

**Status (2026-10-16):** all items below are in use except the Attack Chopper (not
downloaded; the code-built gunship stays, so no CC-BY credit is needed) and the second
Poly Pizza "tank" (it is a walker/fuel-tank shape).

## Models
| ✔ | Asset | Download from | License | Used for |
|---|---|---|---|---|
| ☐ | Kenney **Car Kit** | https://kenney.nl/assets/car-kit ("Continue without donating" gives the zip) | CC0 | Parked cars to crush |
| ☐ | Quaternius tank (glTF) | https://poly.pizza/m/Dc4k4CooN3 → Download → glTF/GLB | CC0 | Military tank |
| ☐ | Quaternius tank 2 (glTF) | https://poly.pizza/m/j59k7ctnZM → Download → glTF/GLB | CC0 | Tank variant |
| ☐ | **Attack Chopper** by Geibu3D | https://opengameart.org/content/attack-chopper | **CC-BY 4.0 — credit required** (shown in the pause menu) | Military helicopter |

## Audio
| ✔ | Asset | Download from | License | Used for |
|---|---|---|---|---|
| ☐ | CC0 Deep Monster Roar | https://opengameart.org/content/cc0-deep-monster-roar | CC0 | Player roar |
| ☐ | 80 CC0 creature SFX | https://opengameart.org/content/80-cc0-creature-sfx | CC0 | Rival roars, hurt |
| ☐ | 80 CC0 creature SFX #2 | https://opengameart.org/content/80-cc0-creture-sfx-2 | CC0 | Stomp, roars |
| ☐ | Kenney **Impact Sounds** | https://kenney.nl/assets/impact-sounds | CC0 | Footsteps, impacts, crushing |
| ☐ | rumble fx | https://opengameart.org/content/rumble-fx | CC0 | Collapses, seismic warning |
| ☐ | Kenney **Sci-Fi Sounds** | https://kenney.nl/assets/sci-fi-sounds | CC0 | Explosions, rockets, pulse |
| ☐ | 25 CC0 bang / firework SFX | https://opengameart.org/node/92774 | CC0 | Tank cannon, blasts |
| ☐ | Laser Beam | https://opengameart.org/content/laser-beam | CC0 | Beam firing |
| ☐ | Seamless Energy Emission Loop | https://opengameart.org/content/seamless-energy-emission-loop | CC0 | Beam hum (loop) |
| ☐ | 63 Digital SFX (lasers, phasers) | https://opengameart.org/content/63-digital-sound-effects-lasers-phasers-space-etc | CC0 | Beam charge, victory |
| ☐ | Helicopter Sounds (aquinn) | https://opengameart.org/content/helicopter-sounds | CC0 | Rotor loop |
| ☐ | Battle Theme (Wolfgang_) | https://opengameart.org/content/battle-theme-0 | CC0 | Combat music |
| ☐ | Scifi City Ambient Loop | https://opengameart.org/node/82668 | CC0 | City ambience |

Optional: **Determined Pursuit** (https://opengameart.org/content/determined-pursuit-epic-orchestra-loop,
CC0) as roaming music. It is a 19 MB WAV, so it needs `ffmpeg` to convert (`brew install ffmpeg`).

Skipped on purpose: packs shipped as `.7z` (no 7-Zip on this machine) and FBX-only packs.

## Credits
All assets in use are CC0 (no attribution required). The menus carry a short courtesy line.
