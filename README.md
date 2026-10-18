# Titans Unleashed

A third-person browser action game: you are a giant atomic lizard. Smash a streamed,
procedurally generated city, fight escalating military, and survive ambushes by rival titan.
Three.js + Rapier + TypeScript + Vite.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (dev panel: top right; F1: debug overlay)
npm test           # unit tests (Vitest)
npm run build      # production build in dist/ (typecheck included)
npm run preview    # serve dist/ locally
```

`?quality=low|medium|high` forces a graphics preset (otherwise medium, stepping down
automatically if frames run slow).

## Controls

WASD move · Shift sprint · mouse look/aim · LMB claw · RMB tail sweep · Space stomp ·
hold E charge & fire beam · R roar · F Atomic Pulse (after an evolution) · Q / MMB lock on ·
Esc pause (remap keys in the pause menu) · F1 debug.

## Assets

None: all 3D content and all (placeholder) sounds are generated in code. See
[docs/ASSETS.md](docs/ASSETS.md) to swap in real sound files.

## Deploy

`dist/` is a plain static site (relative paths), so any static host works:

- **GitHub Pages:** push this repo to GitHub, set Settings → Pages → Source to
  "GitHub Actions"; `.github/workflows/deploy.yml` builds, tests and publishes on every push
  to `main`.
- **Netlify Drop:** run `npm run build` and drag the `dist/` folder onto
  https://app.netlify.com/drop.
