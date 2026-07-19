# Tests

Automated regression tests protecting the TCF practice website. Nothing in
this folder ever modifies application code or data — tests only read and
verify.

## Running

```
npm ci               # clean install from the committed lockfile
npm run build        # esbuild src/app.jsx -> dist/app.js
npm run test:data    # data-integrity + production-build + PWA integrity checks (Node built-in test runner)
npm run test:e2e     # Playwright end-to-end regression tests (Chromium)
npm test             # build + test:data + test:e2e, in order
```

`npm run test:e2e` requires Playwright's Chromium browser to be available
(e.g. `npx playwright install chromium` once, or a pre-provisioned
`PLAYWRIGHT_BROWSERS_PATH`).

## Files

- `data-integrity.test.js` — asserts `QUESTIONS.length === 170`,
  `READING.length === 1152`, `ALL.length === 1322`, ordering
  (`QUESTIONS` then `READING`), required object shape, valid
  correct-answer indexes, and valid/sequential `ALL` ids. It never rewrites
  or "fixes" the data — a failing assertion means the data changed and
  needs human review, not an automatic correction.
- `build-integrity.test.js` — asserts the production build (Phase 3)
  stays intact: `npm run build` succeeds, `dist/app.js` exists and passes
  `node --check`, contains no ESM import/export and no raw JSX (only
  compiled `React.createElement` calls), `index.html` references
  `dist/app.js` and contains no Babel Standalone / `text/babel` reference,
  `src/app.jsx` remains the source of truth, and no `node_modules` files
  are tracked by git.
- `app.spec.js` — Playwright end-to-end tests covering Home, Grammar mode,
  Reading mode, Quick mode, answering (radiogroup/`aria-checked`
  semantics), correct/incorrect feedback (`aria-live="polite"`),
  next-question navigation, a full quiz reaching the Result screen with an
  internally-consistent score, Review, Settings, Tutor (including input
  stability while typing), decorative-icon `aria-hidden`, heading
  structure, localStorage persistence across a refresh, and an absence of
  console/page errors, failed `dist/app.js` requests, or Babel requests.
- `helpers/load-app-data.js` — loads `dist/app.js` in an isolated `vm`
  sandbox (no real DOM/React rendering) to read `QUESTIONS`, `READING`,
  `ALL`, etc. for the data-integrity tests.
- `helpers/setup-page.js` — Playwright route helpers used by `app.spec.js`:
  serves the same React/ReactDOM 18.2.0 UMD builds `index.html` already
  loads from cdnjs (byte-identical vendored copies, see
  `fixtures/vendor/README.md`) so e2e tests are hermetic, and stubs the
  Tutor's Cloudflare Worker endpoint so tests never depend on live network
  access. Neither `index.html` nor the Worker URL/payload are touched.
- `helpers/static-server.js` — a small dependency-free static file server
  (Node built-ins only) used by `playwright.config.js` to serve the
  repository root the same way GitHub Pages would.
- `fixtures/data-integrity-baseline.json` — checksum baseline (SHA-256 over
  a canonical JSON serialization of `QUESTIONS`, `READING`, and `ALL`)
  generated from commit `c38f44361f7bc9ffacb39a618364da6de86b4185`. Any
  future change to question text, options, correct-answer indexes,
  explanations, passages, or ordering will change the checksum and fail
  `data-integrity.test.js`.
- `generate-baseline.js` — a manual developer utility (never run
  automatically by `npm test`) to regenerate the baseline above. Only run
  this after an intentional, human-reviewed content change, and commit the
  regenerated baseline as its own reviewed change.
- `pwa-integrity.test.js` — Phase 5 PWA checks: `manifest.webmanifest`
  exists, is valid JSON, has the required fields, `display: "standalone"`,
  a relative (GitHub-Pages-subpath-compatible) `start_url`/`scope`, and
  192/512/maskable icons that resolve to real files; `index.html`
  references the manifest and `pwa-register.js`; and a set of *behavioral*
  checks (via `helpers/service-worker-harness.js`) proving the service
  worker precaches the required local app-shell files, uses a versioned
  cache name, deletes obsolete caches and calls `clients.claim()` on
  activate, never intercepts non-GET requests or the Tutor/Cloudflare
  Worker endpoint, and falls back to the cached shell for offline
  navigation.
- `pwa.spec.js` — Playwright browser tests (service workers explicitly
  allowed via `test.use({ serviceWorkers: 'allow' })`, since the default in
  `playwright.config.js` blocks them for the other, unrelated functional
  tests): the service worker registers and reaches `activated`, the
  manifest and icons load successfully, the same-origin app shell
  (`dist/app.js`, manifest, icons) is served correctly while offline, an
  offline reload serves the cached shell instead of a browser error page,
  no Babel request ever occurs, and the Tutor's Cloudflare Worker endpoint
  is always hit live (two distinct calls for two distinct questions,
  proving nothing is cached/stale).
- `helpers/service-worker-harness.js` — runs the real `service-worker.js`
  source in an isolated `vm` sandbox with a minimal in-memory polyfill of
  the Cache Storage API, so install/activate/fetch behavior can be
  verified directly in Node without a browser.

## A note on Phase 5 (PWA) test scope

This sandboxed environment's outbound network policy blocks the real
`cdnjs.cloudflare.com` CDN entirely (confirmed independently: a direct
request returns HTTP 403 "Host not in allowlist"). `pwa.spec.js` mocks
those two CDN requests so tests can run hermetically, but that mocking only
applies to a page's *first* navigation — once the service worker has
activated and starts controlling the page, it intercepts fetches from
within its own execution context, which Playwright's request mocking
cannot see in this Playwright version. Automated browser tests therefore
verify every part of the offline mechanism that doesn't depend on reaching
that specific CDN (registration, manifest/icons, the same-origin app-shell
precache, and the offline navigation fallback). Full end-to-end offline
rendering (Home/Grammar/Reading/Quick with React actually executing,
across a genuine `context.setOffline(true)` reload) was additionally
verified manually with a same-origin substitute for the CDN scripts — see
the Phase 5 report for that walkthrough. `service-worker.js` itself is
unaffected by any of this — it always references the real, unmodified
cdnjs URLs.

## Philosophy

- Tests are read-only observers. They fail loudly on unexpected changes
  instead of normalizing, sorting, deduplicating, or repairing data.
- The existing question/reading data (as of commit `c38f443`) is the
  approved baseline, including any of its pre-existing quirks.
