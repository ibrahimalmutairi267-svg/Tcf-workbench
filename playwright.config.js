'use strict';

const { defineConfig } = require('@playwright/test');

const PORT = process.env.PORT || 4173;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
    // Existing (Phase 1-4) functional tests don't exercise the service
    // worker and rely on mocking the React/ReactDOM CDN requests via
    // page.route(). Service-worker-controlled pages fetch cross-origin
    // resources from within the worker's own execution context, which
    // page-level route mocks cannot intercept — so service workers are
    // blocked by default here to keep those tests fast and deterministic.
    // The dedicated PWA test file (pwa.spec.js) explicitly re-enables
    // service workers for the tests that need them.
    serviceWorkers: 'block',
  },
  webServer: {
    command: `node tests/helpers/static-server.js`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { PORT: String(PORT) },
  },
});
