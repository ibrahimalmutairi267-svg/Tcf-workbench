'use strict';

/**
 * PWA integrity tests (Phase 5).
 *
 * These are read-only observers, exactly like the Phase 4 data/build
 * integrity tests: they never modify the manifest, service worker, icons,
 * or index.html. A failing assertion means something about the PWA setup
 * regressed and needs human review.
 *
 * Split in two halves:
 *   1. Static file checks (manifest JSON, index.html wiring, icon files).
 *   2. Service-worker *behavior* checks, using a lightweight in-memory
 *      simulation of the browser's Cache Storage API (see
 *      helpers/service-worker-harness.js) so install/activate/fetch logic
 *      is verified for real — not just guessed at via string matching.
 *
 * Run with: node tests/pwa-integrity.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createServiceWorkerHarness, FakeResponse } = require('./helpers/service-worker-harness');

const REPO_ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'manifest.webmanifest');
const INDEX_HTML_PATH = path.join(REPO_ROOT, 'index.html');
const SERVICE_WORKER_PATH = path.join(REPO_ROOT, 'service-worker.js');
const PWA_REGISTER_PATH = path.join(REPO_ROOT, 'pwa-register.js');

// ===================== Manifest integrity =====================

test('manifest.webmanifest exists', () => {
  assert.ok(fs.existsSync(MANIFEST_PATH), 'manifest.webmanifest should exist at the repository root');
});

let manifest;
test('manifest.webmanifest is valid JSON', () => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  manifest = JSON.parse(raw); // throws (and fails the test) if invalid
  assert.equal(typeof manifest, 'object');
});

test('manifest has the required fields', () => {
  for (const field of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons', 'background_color', 'theme_color']) {
    assert.ok(field in manifest, `manifest is missing required field "${field}"`);
  }
});

test('manifest display mode is "standalone"', () => {
  assert.equal(manifest.display, 'standalone');
});

test('manifest does not change the existing site title/branding', () => {
  assert.equal(manifest.name, 'TCF B2');
  assert.equal(manifest.short_name, 'TCF B2');
});

test('manifest start_url and scope are relative (GitHub Pages subpath compatible)', () => {
  for (const field of ['start_url', 'scope']) {
    const value = manifest[field];
    assert.equal(typeof value, 'string');
    assert.ok(value.startsWith('./'), `manifest.${field} ("${value}") should be a relative path starting with "./" so it works under a GitHub Pages repository subpath`);
    assert.ok(!/^([a-z]+:)?\/\//i.test(value), `manifest.${field} must not be an absolute URL`);
  }
});

test('manifest includes 192x192 and 512x512 PNG icons', () => {
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), 'manifest.icons should include a 192x192 icon');
  assert.ok(sizes.includes('512x512'), 'manifest.icons should include a 512x512 icon');
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
  }
});

test('manifest includes a maskable icon', () => {
  assert.ok(
    manifest.icons.some((i) => (i.purpose || '').includes('maskable')),
    'manifest.icons should include at least one icon with purpose "maskable"'
  );
});

test('every manifest icon path is relative and resolves to a real file', () => {
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith('/'), `icon src "${icon.src}" should be relative, not root-absolute`);
    const resolved = path.join(REPO_ROOT, icon.src);
    assert.ok(fs.existsSync(resolved), `icon file not found: ${icon.src}`);
  }
});

// ===================== index.html wiring =====================

test('index.html references the manifest', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  assert.match(html, /<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest">/);
});

test('index.html references the service-worker registration script', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  assert.match(html, /<script\s+src="\.\/pwa-register\.js"><\/script>/);
});

test('index.html still keeps the dist/app.js script tag (Phase 3 architecture untouched)', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  assert.match(html, /<script\s+src=["']dist\/app\.js["']><\/script>/);
});

// ===================== Service-worker / registration files =====================

test('service-worker.js exists', () => {
  assert.ok(fs.existsSync(SERVICE_WORKER_PATH));
});

test('pwa-register.js exists', () => {
  assert.ok(fs.existsSync(PWA_REGISTER_PATH));
});

test('pwa-register.js registers service-worker.js with a relative path and fails silently', () => {
  const src = fs.readFileSync(PWA_REGISTER_PATH, 'utf-8');
  assert.match(src, /register\(['"]\.\/service-worker\.js['"]\)/);
  assert.match(src, /\.catch\(/, 'registration should be wrapped in a .catch() so it never throws/breaks the app');
});

// ===================== Static source checks on service-worker.js =====================

test('service worker source contains no Babel reference', () => {
  const src = fs.readFileSync(SERVICE_WORKER_PATH, 'utf-8');
  assert.ok(!/babel/i.test(src), 'service-worker.js should never reference Babel');
});

test('service worker source contains no node_modules reference', () => {
  const src = fs.readFileSync(SERVICE_WORKER_PATH, 'utf-8');
  assert.ok(!/node_modules/.test(src));
});

test('service worker source does not hardcode the Tutor/Cloudflare Worker endpoint into any cache list', () => {
  const src = fs.readFileSync(SERVICE_WORKER_PATH, 'utf-8');
  assert.ok(!/workers\.dev/i.test(src), 'the Cloudflare Worker URL must never appear in service-worker.js');
});

// ===================== Behavioral checks (simulated Cache Storage) =====================

test('cache name is versioned', () => {
  const harness = createServiceWorkerHarness();
  const cacheName = harness.internals.CACHE_NAME;
  assert.match(cacheName, /^tcf-app-shell-v\d+$/);
});

test('install precaches all required local application-shell files', async () => {
  const harness = createServiceWorkerHarness();
  await harness.fireInstall();
  const cacheName = harness.internals.CACHE_NAME;
  const cache = await harness.caches.open(cacheName);
  const cachedUrls = (await cache.keys()).map((k) => k.url);

  for (const required of ['./index.html', './dist/app.js', './manifest.webmanifest']) {
    assert.ok(cachedUrls.includes(required), `precache is missing required file: ${required}`);
  }
  const iconEntries = cachedUrls.filter((u) => u.includes('/icons/'));
  assert.ok(iconEntries.length >= 2, 'precache should include at least the 192 and 512 icons');
});

test('precache lists contain no Babel asset, no node_modules path, and no Tutor/API endpoint', async () => {
  const harness = createServiceWorkerHarness();
  await harness.fireInstall();
  const cacheName = harness.internals.CACHE_NAME;
  const cache = await harness.caches.open(cacheName);
  const cachedUrls = (await cache.keys()).map((k) => k.url);

  for (const url of cachedUrls) {
    assert.ok(!/babel/i.test(url), `precached url should not reference Babel: ${url}`);
    assert.ok(!/node_modules/.test(url), `precached url should not reference node_modules: ${url}`);
    assert.ok(!/workers\.dev/i.test(url), `precached url should not be the Tutor/Cloudflare Worker endpoint: ${url}`);
  }
});

test('install calls skipWaiting so updates activate promptly', async () => {
  const harness = createServiceWorkerHarness();
  await harness.fireInstall();
  assert.equal(harness.skipWaitingCalls.length, 1);
});

test('activate deletes obsolete versioned caches and keeps the current one', async () => {
  const harness = createServiceWorkerHarness();
  await harness.fireInstall();
  // Simulate a stale cache left over from a previous service-worker version.
  await harness.caches.open('tcf-app-shell-v0');
  await harness.caches.open('some-unrelated-cache'); // should be left alone

  await harness.fireActivate();

  const remaining = await harness.caches.keys();
  assert.ok(!remaining.includes('tcf-app-shell-v0'), 'obsolete versioned cache should have been deleted');
  assert.ok(remaining.includes(harness.internals.CACHE_NAME), 'current cache should still exist');
  assert.ok(remaining.includes('some-unrelated-cache'), 'unrelated caches outside our prefix should not be touched');
});

test('activate claims clients', async () => {
  const harness = createServiceWorkerHarness();
  await harness.fireInstall();
  await harness.fireActivate();
  assert.equal(harness.claimCalls.length, 1);
});

test('non-GET requests (e.g. the Tutor POST call) are never intercepted', async () => {
  const harness = createServiceWorkerHarness();
  await harness.fireInstall();
  const result = await harness.fireFetch({
    method: 'POST',
    url: 'https://tcf.b-r-h-oomy-ih.workers.dev',
    mode: 'cors',
  });
  assert.equal(result.intercepted, false, 'POST requests must never be intercepted/cached by the service worker');
});

test('a GET request to the Tutor/Cloudflare Worker origin is never intercepted', async () => {
  const harness = createServiceWorkerHarness();
  await harness.fireInstall();
  const result = await harness.fireFetch({
    method: 'GET',
    url: 'https://tcf.b-r-h-oomy-ih.workers.dev/some-path',
    mode: 'cors',
  });
  assert.equal(result.intercepted, false);
});

test('unrelated third-party cross-origin requests are never intercepted', async () => {
  const harness = createServiceWorkerHarness();
  await harness.fireInstall();
  const result = await harness.fireFetch({
    method: 'GET',
    url: 'https://example.com/some-random-script.js',
    mode: 'cors',
  });
  assert.equal(result.intercepted, false);
});

test('known same-origin precached assets are served cache-first', async () => {
  const harness = createServiceWorkerHarness();
  await harness.fireInstall();
  const result = await harness.fireFetch({
    method: 'GET',
    url: 'https://example.github.io/Tcf-workbench/dist/app.js',
    mode: 'no-cors',
  });
  assert.equal(result.intercepted, true);
  assert.ok(result.response.ok);
});

test('navigation falls back to the cached app shell when the network is unavailable', async () => {
  const harness = createServiceWorkerHarness({
    fetchImpl: async (urlOrRequest) => {
      // Precaching during install still "succeeds" (simulated network),
      // but any fetch triggered from the fetch-event handler (i.e. real
      // navigation attempts) simulates an offline network failure.
      if (typeof urlOrRequest === 'string') {
        return new FakeResponse('ok', { status: 200 });
      }
      throw new Error('simulated offline network failure');
    },
  });
  await harness.fireInstall();
  const result = await harness.fireFetch({
    method: 'GET',
    url: 'https://example.github.io/Tcf-workbench/index.html',
    mode: 'navigate',
  });
  assert.equal(result.intercepted, true);
  assert.ok(result.response.ok, 'offline navigation should be served from the cached index.html app shell');
});

test('GitHub Pages subpath hosting: precache URLs resolve correctly under a repository subpath', () => {
  const harness = createServiceWorkerHarness({ origin: 'https://ibrahimalmutairi267-svg.github.io/Tcf-workbench/' });
  const resolved = harness.internals.LOCAL_PRECACHE_URLS.map(
    (p) => new URL(p, harness.sandbox.self.location.href).href
  );
  assert.ok(resolved.every((u) => u.startsWith('https://ibrahimalmutairi267-svg.github.io/Tcf-workbench/')));
});
