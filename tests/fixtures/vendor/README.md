# Vendored CDN fixtures (test-only)

`react.production.min.js` and `react-dom.production.min.js` in this folder
are unmodified copies of the exact React/ReactDOM 18.2.0 UMD builds that
`index.html` loads from `https://cdnjs.cloudflare.com/...` in production.

They exist **only** so the Playwright end-to-end tests can run hermetically
(offline-friendly, no flakiness from third-party CDN availability) by
intercepting the two CDN requests and fulfilling them locally with byte
identical content — see `tests/app.spec.js`.

`index.html` itself is never changed: it still loads React and ReactDOM from
the CDN in production, exactly as it did after Phase 3.
