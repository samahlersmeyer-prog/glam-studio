# Glam Studio — notes for Claude

Sam's game app for his daughters (Junie and Josie): Runway Stars, Case Craft, Dream Rooms. Live at https://samahlersmeyer-prog.github.io/glam-studio/ (GitHub Pages from `main`). Pushing to `main` deploys.

## Working rules
- The whole app is `index.html` (markup, one big `<style>`, one big `<script>`). Read only the part you need (grep first).
- After any change: `python3 tools/stamp.py`, then commit and push. It updates the service-worker version and rebuilds `legacy/`. Never hand-edit `V`/`SHELL` in `sw.js` or anything in `legacy/`.

## Offline
- Everything is local: fonts in `fonts/`, three.js r128 in `vendor/three.min.js` (Dream Rooms loads it on first use). No CDN links — keep it that way or offline breaks.
- `sw.js` precaches the app so it opens instantly and plays with no internet; updates arrive quietly in the background. Saves live in localStorage (per device).

## Old iPad (iOS 9) copy — `legacy/`
- Same approach as Big Dawg Daily. Link: https://samahlersmeyer-prog.github.io/glam-studio/legacy/ — the main page also sends old Safari there automatically (no PointerEvent or no `?.` support; add `?modern` to skip).
- Built by `tools/legacy/build.mjs` (run by `stamp.py`; needs Node): pulls the big `<script>`/`<style>` out of `index.html`; Babel to ES5 + core-js polyfills; three.js transpiled to `legacy/three.js` (cached in `tools/legacy/.three-*.js`); 3D goes easier on the GPU (no antialias, 1024 shadows, PCF); CSS grid/gap/inset/clamp rewritten to old flexbox.
- `tools/legacy/shim.js`: DOM helpers, pointer→touch (one event per finger, for pinch), ResizeObserver, canvas ellipse, 1x pixel ratio, and layout old CSS can't do — the tablet two-column screens (`#studio`, `#show`, `#caseStudio`, `#caseDone`) and `repeat(auto-fill, minmax())` grids.
- `tools/legacy/legacy.css`: hand fixes (buttons can't be flex boxes on old Safari: home tiles, client cards). If a new layout looks broken on the iPad, fix it there.
- Offline via `legacy/manifest.appcache` (old Application Cache); a new version swaps in on the next open. The iPad's home-screen icon should point at the `/legacy/` link.
- Build checks: anything newer than ES5 fails the build; renamed hooks it patches (three.js loader, renderer/shadow setup) fail loudly.
