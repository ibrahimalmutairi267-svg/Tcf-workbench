'use strict';

/**
 * Minimal, production-safe service-worker registration.
 *
 * - Registers only when service workers are supported.
 * - Registers only in secure contexts (HTTPS, or localhost during
 *   development) — `navigator.serviceWorker` is already undefined in
 *   insecure contexts, so this also falls through safely there.
 * - Fails silently: never throws, never logs, never shows any UI. If
 *   registration fails for any reason (offline first visit, unsupported
 *   browser, etc.) the app simply continues to work online as before.
 * - Uses a relative path so the registration scope matches wherever the
 *   site is hosted, including a GitHub Pages repository subpath such as
 *   /Tcf-workbench/.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function register() {
    navigator.serviceWorker.register('./service-worker.js').catch(function () {
      // Intentionally silent — offline installability is a progressive
      // enhancement, not a requirement for the app to function online.
    });
  });
}
