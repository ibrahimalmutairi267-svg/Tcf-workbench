# Tests

Automated regression tests protecting the TCF practice website. Nothing in
this folder ever modifies application code or data — tests only read and
verify.

## Running

```
npm ci               # clean install from the committed lockfile
npm run build        # esbuild src/app.jsx -> dist/app.js
npm run test:data    # data-integrity + production-build checks (Node built-in test runner)
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

## Philosophy

- Tests are read-only observers. They fail loudly on unexpected changes
  instead of normalizing, sorting, deduplicating, or repairing data.
- The existing question/reading data (as of commit `c38f443`) is the
  approved baseline, including any of its pre-existing quirks.
