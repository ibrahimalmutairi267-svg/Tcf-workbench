'use strict';

/**
 * Minimal, native service worker for the TCF B2 practice site.
 *
 * Strategy (deliberately simple — no framework, no runtime caching of
 * arbitrary requests):
 *   - Precache the small, fixed "app shell" needed to launch and use the
 *     existing local quiz (index.html, the compiled dist/app.js bundle,
 *     the manifest, the icons, and the two exact React/ReactDOM CDN
 *     scripts index.html already loads with `crossorigin`, so the app can
 *     actually render while offline).
 *   - Navigation requests and the two CDN scripts: network-first, falling
 *     back to the precached copy only when the network is unavailable, so
 *     normal online behavior (and any dev/test network tooling) is
 *     completely unaffected.
 *   - Other known same-origin app-shell assets (dist/app.js, manifest,
 *     icons): cache-first, since they are static and versioned by the
 *     cache name.
 *   - Everything else (in particular the Tutor's Cloudflare Worker API,
 *     and any other cross-origin request) is left completely untouched —
 *     the service worker does not intercept it at all, so it behaves
 *     exactly like normal, uncached network requests, online or offline.
 *   - Only GET requests are ever considered for caching. Non-GET requests
 *     (e.g. the Tutor's POST calls) are never touched by this worker.
 *   - Only successful (response.ok) responses are ever cached — failed/
 *     error responses are never stored.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `tcf-app-shell-${CACHE_VERSION}`;
const CACHE_PREFIX = 'tcf-app-shell-';

// Same-origin files required to launch and use the app offline. Paths are
// relative to this service worker's own location, so this works whether
// the site is hosted at a domain root or under a GitHub Pages repository
// subpath such as /Tcf-workbench/.
const LOCAL_PRECACHE_URLS = [
  './',
  './index.html',
  './dist/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// The exact CDN scripts index.html loads (with `crossorigin`, so cdnjs
// responds with proper CORS headers and these are real, inspectable `cors`
// responses — not opaque). These are required for the app to render at
// all offline. This is a small, fixed, versioned list — not dynamic
// caching of arbitrary third-party resources.
const CDN_PRECACHE_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Same-origin app-shell files must all succeed, or installation
      // fails (matches the standard "all-or-nothing" app-shell pattern).
      await cache.addAll(LOCAL_PRECACHE_URLS);

      // The CDN scripts are best-effort: if a transient network hiccup
      // during install prevents fetching them, that should not block the
      // rest of the offline app shell from being available. The fetch
      // handler below will simply fall back to the network for these URLs
      // if they were not precached.
      await Promise.all(
        CDN_PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { mode: 'cors' });
            if (response && response.ok) {
              await cache.put(url, response);
            }
          } catch (e) {
            // Ignore — best effort only.
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function isPrecachedUrl(url) {
  return CDN_PRECACHE_URLS.includes(url);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never touch non-GET requests (e.g. the Tutor's POST calls to the
  // Cloudflare Worker). Let the browser handle them exactly as normal.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Only handle same-origin requests and the two precached CDN scripts.
  // Everything else (in particular the Tutor/Cloudflare Worker API, and
  // any other third-party resource) is left completely alone.
  const isSameOrigin = url.origin === self.location.origin;
  const isKnownCdnAsset = isPrecachedUrl(request.url);
  if (!isSameOrigin && !isKnownCdnAsset) {
    return;
  }

  // Navigation requests: network-first, falling back to the cached app
  // shell only when offline/unreachable, so online users always see the
  // live site.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (e) {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match('./index.html');
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // The two cross-origin CDN scripts: network-first, falling back to the
  // precached copy only when the network is unavailable. This keeps
  // normal online behavior (and any dev/test network tooling) completely
  // unaffected, while still allowing the app to render fully offline.
  if (isKnownCdnAsset) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (e) {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Known precached same-origin assets: cache-first, since they are
  // static and versioned by the cache name.
  if (LOCAL_PRECACHE_URLS.some((p) => new URL(p, self.location.href).href === request.url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (e) {
          return Response.error();
        }
      })()
    );
    return;
  }

  // Any other same-origin request we don't recognize: do not intercept at
  // all, so it behaves exactly as it would without this service worker.
});
