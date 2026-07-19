'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REACT_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js';
const REACT_DOM_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js';
const WORKER_URL = 'https://tcf.b-r-h-oomy-ih.workers.dev';

const VENDOR_DIR = path.join(__dirname, '..', 'fixtures', 'vendor');
const REACT_LOCAL = fs.readFileSync(path.join(VENDOR_DIR, 'react.production.min.js'));
const REACT_DOM_LOCAL = fs.readFileSync(path.join(VENDOR_DIR, 'react-dom.production.min.js'));

/**
 * index.html always loads React/ReactDOM from the real cdnjs CDN — that is
 * unchanged production behavior (Phase 3 requirement) and is never edited
 * here. For hermetic, network-independent test runs we fulfill those two
 * specific requests with byte-identical vendored copies instead of letting
 * the browser hit the public internet. This keeps the tests fast and
 * reliable in any environment (including offline CI) without touching a
 * single line of application code.
 */
async function installCdnFallback(page) {
  await page.route(REACT_CDN_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: REACT_LOCAL })
  );
  await page.route(REACT_DOM_CDN_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: REACT_DOM_LOCAL })
  );
}

/**
 * Stubs the Tutor's Cloudflare Worker endpoint so tests never depend on a
 * live network call. The Worker URL and the request payload shape sent by
 * the app are left completely untouched — this only fulfills the response.
 */
async function installWorkerMock(page) {
  await page.route(WORKER_URL, async (route) => {
    const request = route.request();
    let lastMessage = '';
    try {
      const body = JSON.parse(request.postData() || '{}');
      const last = (body.messages || []).slice(-1)[0];
      lastMessage = last ? last.content : '';
    } catch (e) {
      lastMessage = '';
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: `Réponse simulée à: ${lastMessage}` }),
    });
  });
}

async function setupPage(page) {
  await installCdnFallback(page);
  await installWorkerMock(page);
}

module.exports = { setupPage, installCdnFallback, installWorkerMock, REACT_CDN_URL, REACT_DOM_CDN_URL, WORKER_URL };
