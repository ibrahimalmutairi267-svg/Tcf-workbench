# TCF Workbench

A TCF B2 training web app (reading comprehension + language structure) with an
AI tutor, generated questions, a study planner, spaced review, and a
learning-journey dashboard.

## How it's built

The app ships as a **single self-contained `index.html`** at the repo root
(served directly by GitHub Pages). That file is **generated** from source — do
not edit it by hand.

- `src/app.jsx` — the application (React).
- `index.template.html` — the HTML shell (head, styles, pre-render theme
  script). The built bundle is inlined at the `/*APP_BUNDLE*/` marker.
- `build.mjs` — esbuild build: bundles React + the app, precompiles JSX,
  minifies, and inlines everything into `index.html`. No CDN, no in-browser
  Babel, works offline.

## Develop

```sh
npm install
npm run build     # regenerates index.html from src/
```

Edit `src/app.jsx` (and the data/lib modules under `src/`), then `npm run build`
and commit the regenerated `index.html` so the live site updates.

## Test

```sh
npm test          # vitest — unit tests for the pure logic
```

## AI backend

AI features call a Cloudflare Worker that holds the Anthropic API key
server-side (see the in-app Settings). The default Worker URL is built in; a
custom one can be set in Settings.
