# CLAUDE.md

Concept website for **Grain & Joint**, a fictional carpentry studio that makes built-in furniture: wardrobes, kitchens, wall units, desks, tables and window seats. The site is the author's personal project; the brand is invented. Plain HTML, CSS and ES modules in `site/`, with no build step. Three.js 0.169.0, GSAP 3.12.5 (with ScrollTrigger) and Lenis 1.1.13 load from jsDelivr through an import map, at exactly these versions.

## Run and test
- `python tools/dev_server.py` serves `site/` on http://localhost:5174 (set `PORT` to change it).
- `node --test` (from the repo root) runs the unit tests. They cover the pure modules in `site/js/configurator/` (`model.js`, `pricing.js`, `share.js`).
- `node tools/smoke.mjs` loads every page in Playwright and fails on console errors (Chromium lives in /opt/pw-browsers).

## Conventions
- `CONTRACTS.md` is the source of truth for the data model, pricing and the 3D API. Change it first, then the code.
- Model and pricing modules are pure: no DOM, no Three.js, so Node can test them.
- Model lengths are in cm; the 3D scene uses metres.
- Page CSS uses only the tokens in `site/css/base.css`.
- Every animation respects `prefers-reduced-motion`.
- Images: Unsplash photos only, each credited in `README.md` and in `site/credits.html`. Everything else is a 3D render or CSS.
- The quote form never sends data anywhere; it only shows a success state.
