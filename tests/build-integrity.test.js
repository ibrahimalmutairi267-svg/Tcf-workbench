'use strict';

/**
 * Production-build integrity tests.
 *
 * These protect the Phase 3 architecture: no Babel Standalone, no runtime
 * JSX compilation, a real reproducible build (esbuild), and a clean
 * repository (no committed node_modules).
 *
 * Run with: node tests/build-integrity.test.js
 * (uses Node's built-in test runner — no extra dependency required)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const DIST_APP_PATH = path.join(REPO_ROOT, 'dist', 'app.js');
const INDEX_HTML_PATH = path.join(REPO_ROOT, 'index.html');
const SRC_APP_PATH = path.join(REPO_ROOT, 'src', 'app.jsx');
const GITIGNORE_PATH = path.join(REPO_ROOT, '.gitignore');

test('npm run build succeeds', () => {
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'pipe' });
});

test('dist/app.js exists after build', () => {
  assert.ok(fs.existsSync(DIST_APP_PATH), 'dist/app.js should exist after running the build');
});

test('dist/app.js passes node --check', () => {
  execFileSync('node', ['--check', DIST_APP_PATH], { cwd: REPO_ROOT, stdio: 'pipe' });
});

test('dist/app.js contains no uncompiled JSX and no ESM import/export', () => {
  const distContent = fs.readFileSync(DIST_APP_PATH, 'utf-8');
  assert.ok(!/^\s*import\s/m.test(distContent), 'dist/app.js should not contain ESM import statements');
  assert.ok(!/^\s*export\s/m.test(distContent), 'dist/app.js should not contain ESM export statements');
  assert.ok(
    distContent.includes('React.createElement'),
    'dist/app.js should contain compiled React.createElement calls (proof JSX was transformed at build time)'
  );
});

test('index.html references dist/app.js with a relative script tag', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  assert.match(html, /<script\s+src=["']dist\/app\.js["']><\/script>/, 'index.html should load dist/app.js via a relative script tag');
});

test('index.html contains no Babel Standalone reference', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  assert.ok(!/babel/i.test(html), 'index.html should not reference Babel Standalone in any form');
});

test('index.html contains no type="text/babel" script', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  assert.ok(!html.includes('text/babel'), 'index.html should not contain a type="text/babel" script tag');
});

test('index.html keeps React/ReactDOM CDN script tags unchanged', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  assert.match(html, /react@?\/?18\.2\.0|react\/18\.2\.0/i, 'index.html should still load React 18.2.0');
  assert.ok(html.includes('react.production.min.js'), 'index.html should still load the React production UMD build');
  assert.ok(html.includes('react-dom.production.min.js'), 'index.html should still load the ReactDOM production UMD build');
});

test('src/app.jsx remains the source application', () => {
  assert.ok(fs.existsSync(SRC_APP_PATH), 'src/app.jsx should exist as the source of truth for the application');
  const src = fs.readFileSync(SRC_APP_PATH, 'utf-8');
  assert.ok(src.includes('const QUESTIONS ='), 'src/app.jsx should define QUESTIONS');
  assert.ok(src.includes('const READING ='), 'src/app.jsx should define READING');
  assert.ok(src.includes('function App('), 'src/app.jsx should define the App component');
});

test('.gitignore excludes node_modules', () => {
  const gitignore = fs.readFileSync(GITIGNORE_PATH, 'utf-8');
  assert.ok(/^node_modules\/?$/m.test(gitignore.trim()) || /node_modules/.test(gitignore), '.gitignore should exclude node_modules');
});

test('no node_modules files are tracked by git', () => {
  const output = execFileSync('git', ['ls-files', '--', 'node_modules'], { cwd: REPO_ROOT, encoding: 'utf-8' });
  assert.equal(output.trim(), '', 'no files under node_modules should be tracked by git');
});
