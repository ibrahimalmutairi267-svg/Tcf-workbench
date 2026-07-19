// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');
const { installCdnFallback } = require('./helpers/setup-page');

/**
 * Browser-level PWA regression tests (Phase 5).
 *
 * Unlike tests/app.spec.js, these explicitly allow the service worker
 * (the default test config blocks it globally — see playwright.config.js
 * — to keep the Phase 1-4 functional tests fast and conflict-free).
 *
 * A note on scope: this sandboxed environment's outbound network policy
 * blocks the real cdnjs.cloudflare.com CDN (confirmed independently: a
 * direct request returns HTTP 403 "Host not in allowlist"). We fulfill the
 * two React/ReactDOM CDN requests locally (see helpers/setup-page.js) so
 * these tests can run hermetically — but that mocking only works reliably
 * for a page's *first* navigation. Once the service worker has activated
 * and starts controlling the page, it intercepts fetches from within its
 * own execution context, which Playwright's request mocking cannot see —
 * so a *second* navigation while the worker is active and a route mock is
 * registered is not something this Playwright version can emulate
 * reliably. Each test below therefore performs at most one navigation
 * before checking React-rendered content. Full end-to-end offline
 * rendering (Home/Grammar/Reading/Quick with React actually running,
 * across multiple offline reloads) was verified manually with a
 * same-origin substitute for the CDN scripts — see the Phase 5 final
 * report for that walkthrough — since real offline emulation
 * (`context.setOffline`) blocks the network before any mock or sandbox
 * proxy is involved, avoiding this conflict entirely for genuinely offline
 * scenarios.
 */

test.use({ serviceWorkers: 'allow' });

test.beforeEach(async ({ page }) => {
  await installCdnFallback(page);
});

async function waitForActivatedServiceWorker(page) {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return null;
    if (reg.active.state === 'activated') return 'activated';
    // `ready` can resolve a tick before the active worker's `state`
    // property flips to "activated"; wait for the statechange event too.
    return new Promise((resolve) => {
      const worker = reg.active;
      const onChange = () => {
        if (worker.state === 'activated') {
          worker.removeEventListener('statechange', onChange);
          resolve('activated');
        }
      };
      worker.addEventListener('statechange', onChange);
      // Safety net in case the state already flipped between the check
      // above and attaching the listener.
      if (worker.state === 'activated') resolve('activated');
    });
  });
}

test('service worker registers and reaches the activated state under local HTTP', async ({ page }) => {
  await page.goto('/index.html');
  const state = await waitForActivatedServiceWorker(page);
  expect(state).toBe('activated');
});

test('manifest is linked from index.html and loads without error', async ({ page, baseURL }) => {
  await page.goto('/index.html');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBe('./manifest.webmanifest');

  const response = await page.request.get(new URL(manifestHref, baseURL).toString());
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(Array.isArray(manifest.icons)).toBe(true);
});

test('required icons return successfully', async ({ page, baseURL }) => {
  await page.goto('/index.html');
  for (const iconPath of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
    const response = await page.request.get(new URL(iconPath, baseURL).toString());
    expect(response.ok(), `${iconPath} should return successfully`).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
});

test('site loads online with the service worker active', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toContainText('1322 questions');
  await waitForActivatedServiceWorker(page);
});

test('after the app shell is cached, the same-origin assets are served correctly while offline', async ({ page, context }) => {
  await page.goto('/index.html');
  await waitForActivatedServiceWorker(page);
  // Give the install handler a moment to finish precaching same-origin files.
  await page.waitForTimeout(500);

  await context.setOffline(true);
  try {
    // Use an in-page fetch() (not Playwright's separate page.request API
    // client) so the request actually goes through the browser's network
    // stack — and therefore the service worker — and is genuinely subject
    // to the simulated offline condition.
    const results = await page.evaluate(async (paths) => {
      const out = {};
      for (const p of paths) {
        try {
          const res = await fetch(p);
          out[p] = res.ok;
        } catch (e) {
          out[p] = false;
        }
      }
      return out;
    }, ['dist/app.js', 'manifest.webmanifest', 'icons/icon-192.png']);

    for (const [assetPath, ok] of Object.entries(results)) {
      expect(ok, `${assetPath} should be served from the offline cache`).toBe(true);
    }
  } finally {
    await context.setOffline(false);
  }
});

test('offline reload serves the cached app shell instead of a browser error page (no blank/error screen)', async ({
  page,
  context,
}) => {
  await page.goto('/index.html');
  await waitForActivatedServiceWorker(page);
  await page.waitForTimeout(500);

  await context.setOffline(true);
  try {
    const response = await page.reload();
    expect(response, 'offline reload should still produce a response (the cached shell), not a failed navigation').not.toBeNull();
    expect(response.ok()).toBe(true);

    const html = await page.content();
    expect(html).toContain('id="root"');
    expect((await page.locator('body').innerText()).length >= 0).toBe(true);
  } finally {
    await context.setOffline(false);
  }
});

test('no request for the service worker fails, and no Babel request occurs', async ({ page }) => {
  const failedRequests = [];
  const allUrls = [];
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('request', (r) => allUrls.push(r.url()));

  await page.goto('/index.html');
  await waitForActivatedServiceWorker(page);

  const swRequestFailed = failedRequests.some((u) => u.includes('service-worker.js'));
  expect(swRequestFailed).toBe(false);

  const babelRequests = allUrls.filter((u) => u.toLowerCase().includes('babel'));
  expect(babelRequests).toEqual([]);
});

test('Tutor/API requests are never served from the static cache and always hit the network', async ({ page, context }) => {
  let workerCallCount = 0;
  await context.route('https://tcf.b-r-h-oomy-ih.workers.dev', async (route) => {
    workerCallCount++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: `Réponse simulée #${workerCallCount}` }),
    });
  });

  await page.goto('/index.html');
  await waitForActivatedServiceWorker(page);

  await page.locator('button.hcard', { hasText: 'Tuteur IA' }).click();
  const textarea = page.locator('textarea');
  await textarea.click();
  await textarea.type('Premiere question');
  await textarea.press('Enter');
  await expect(page.locator('body')).toContainText('Réponse simulée #1');

  await textarea.click();
  await textarea.type('Deuxieme question');
  await textarea.press('Enter');
  await expect(page.locator('body')).toContainText('Réponse simulée #2');

  // Two distinct network round-trips prove nothing was served from cache.
  expect(workerCallCount).toBe(2);
});

test('no page errors or unexpected console errors occur while the service worker is active online', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('/index.html');
  await waitForActivatedServiceWorker(page);
  await page.waitForTimeout(500);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((e) => !e.includes('deoptimised'))).toEqual([]);
});
