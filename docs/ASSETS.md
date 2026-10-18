# Downloaded assets (audio only)

Everything below was checked on the source page on 2026-10-16. Put each download into
`assets-src/` (zips as-is). Raw files stay out of git; the processed, compressed versions go
to `public/` and are committed.

Decision: every 3D model is code-built (titan, city, terrain, trees, vehicles, military),
so the look stays consistent and original. Only sounds are downloaded. If you supply
model files later, they need a loader and pipeline again (removed on purpose).

**Pipeline:** put downloads in `assets-src/`, run `npm run assets`. The script
(`tools/build-assets.mjs`) holds the exact file lists: sounds copied, big WAVs downmixed
to mono (no ffmpeg here — installing it would allow proper OGG encoding). Sound ids →
files live in `src/config/audio.ts`.

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
