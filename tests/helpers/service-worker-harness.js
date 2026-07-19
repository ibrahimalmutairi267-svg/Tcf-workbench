'use strict';

/**
 * A minimal, in-memory simulation of the browser APIs a service worker
 * relies on (self/addEventListener, the Cache Storage API, fetch), so
 * service-worker.js's actual install/activate/fetch logic can be executed
 * and verified in plain Node — no browser required.
 *
 * This is deliberately small and only implements what service-worker.js
 * uses. It never touches the real network or filesystem beyond reading the
 * service worker's own source text.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SW_PATH = path.join(__dirname, '..', '..', 'service-worker.js');

class FakeResponse {
  constructor(body, init) {
    this.body = body;
    this.status = (init && init.status) || 200;
    this.ok = this.status >= 200 && this.status < 300;
  }
  clone() {
    return new FakeResponse(this.body, { status: this.status });
  }
}

class FakeCache {
  constructor(fetchImpl) {
    this.store = new Map();
    this.fetchImpl = fetchImpl;
  }
  _key(reqOrUrl) {
    return typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
  }
  async match(reqOrUrl) {
    return this.store.get(this._key(reqOrUrl));
  }
  async put(reqOrUrl, response) {
    this.store.set(this._key(reqOrUrl), response);
  }
  async addAll(urls) {
    for (const url of urls) {
      const response = await this.fetchImpl(url);
      if (!response || !response.ok) {
        throw new Error('addAll failed for ' + url);
      }
      this.store.set(url, response);
    }
  }
  async keys() {
    return [...this.store.keys()].map((url) => ({ url }));
  }
}

function createFakeCaches(fetchImpl) {
  const stores = new Map();
  return {
    _stores: stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new FakeCache(fetchImpl));
      return stores.get(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
}

/**
 * Loads service-worker.js into a sandboxed vm context with fake self/
 * caches/fetch, registers its event listeners, and returns helpers to
 * drive the install/activate/fetch lifecycle for assertions.
 *
 * @param {object} options
 * @param {(url: string) => Promise<FakeResponse>} [options.fetchImpl]
 * @param {string} [options.origin] Simulated origin, e.g. to model GitHub
 *   Pages subpath hosting.
 */
function createServiceWorkerHarness({ fetchImpl, origin = 'https://example.github.io/Tcf-workbench/' } = {}) {
  const source = fs.readFileSync(SW_PATH, 'utf-8');

  const listeners = {};
  const claimCalls = [];
  const skipWaitingCalls = [];

  const fetchImplResolved = fetchImpl || (async () => new FakeResponse('ok', { status: 200 }));
  const fakeCaches = createFakeCaches(fetchImplResolved);

  const sandbox = {
    console,
    URL,
    Promise,
    Response: FakeResponse,
    caches: fakeCaches,
    self: {
      location: new URL(origin + 'service-worker.js'),
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
      skipWaiting: async () => {
        skipWaitingCalls.push(true);
      },
      clients: {
        claim: async () => {
          claimCalls.push(true);
        },
      },
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.fetch = fetchImplResolved;

  vm.createContext(sandbox);
  // Appending the capture statement to the same script (rather than a
  // separate vm.runInContext call) lets it see the top-level const/let
  // bindings from service-worker.js, which are not exposed as properties
  // of the sandbox object the way `var`/function declarations are.
  const capture = '\nglobalThis.__SW_INTERNALS__ = { CACHE_NAME, CACHE_PREFIX, LOCAL_PRECACHE_URLS, CDN_PRECACHE_URLS };';
  vm.runInContext(source + capture, sandbox, { filename: 'service-worker.js' });

  async function fireInstall() {
    let capturedPromise;
    await listeners.install({ waitUntil: (p) => (capturedPromise = p) });
    await capturedPromise;
  }

  async function fireActivate() {
    let capturedPromise;
    await listeners.activate({ waitUntil: (p) => (capturedPromise = p) });
    await capturedPromise;
  }

  async function fireFetch(request) {
    let responded = false;
    let respondedWith;
    const event = {
      request,
      respondWith: (p) => {
        responded = true;
        respondedWith = p;
      },
    };
    await listeners.fetch(event);
    if (responded) {
      return { intercepted: true, response: await respondedWith };
    }
    return { intercepted: false };
  }

  return {
    sandbox,
    internals: sandbox.__SW_INTERNALS__,
    caches: fakeCaches,
    claimCalls,
    skipWaitingCalls,
    fireInstall,
    fireActivate,
    fireFetch,
    hasListener: (type) => typeof listeners[type] === 'function',
  };
}

module.exports = { createServiceWorkerHarness, FakeResponse, SW_PATH };
