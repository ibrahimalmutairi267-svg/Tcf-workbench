'use strict';

/**
 * Loads the production bundle (dist/app.js) in an isolated vm sandbox and
 * returns the application's core data structures without rendering React
 * or touching the real DOM/network/localStorage.
 *
 * This is intentionally read-only: it never edits, sorts, or normalizes the
 * extracted data. Tests are expected to fail loudly if something changed
 * rather than silently repairing it.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIST_APP_PATH = path.join(__dirname, '..', '..', 'dist', 'app.js');

function createNoopProxy(applyResult) {
  return new Proxy(function () {}, {
    get: () => createNoopProxy(applyResult),
    apply: () => applyResult,
    construct: () => ({}),
  });
}

function loadAppData() {
  if (!fs.existsSync(DIST_APP_PATH)) {
    throw new Error(
      `dist/app.js not found at ${DIST_APP_PATH}. Run "npm run build" first.`
    );
  }

  let source = fs.readFileSync(DIST_APP_PATH, 'utf-8').trim();

  // esbuild wraps the bundle in an IIFE: "(() => { ... })();"
  // We strip that wrapper so the top-level `const` declarations become
  // reachable from the vm context, without altering any application logic.
  const WRAPPER_START = '(() => {';
  const WRAPPER_END = '})();';
  if (!source.startsWith(WRAPPER_START) || !source.endsWith(WRAPPER_END)) {
    throw new Error(
      'dist/app.js does not have the expected esbuild IIFE wrapper. ' +
        'The build output format may have changed; update this test helper.'
    );
  }
  source = source.slice(WRAPPER_START.length, -WRAPPER_END.length);

  const fakeReact = createNoopProxy(undefined);
  const fakeReactDOM = createNoopProxy({ render: () => {} });

  const sandbox = {
    console,
    React: fakeReact,
    ReactDOM: fakeReactDOM,
    window: {},
    document: { getElementById: () => null },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    fetch: () => Promise.reject(new Error('network access disabled in test sandbox')),
  };
  vm.createContext(sandbox);

  const capture =
    '\nglobalThis.__APP_DATA__ = { QUESTIONS, READING, ALL, GRAMMAR_COUNT, READING_COUNT, TUTOR_STARTERS };';

  vm.runInContext(source + capture, sandbox, { filename: 'dist/app.js' });

  return sandbox.__APP_DATA__;
}

module.exports = { loadAppData, DIST_APP_PATH };
