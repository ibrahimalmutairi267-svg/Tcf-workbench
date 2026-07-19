// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');
const { setupPage, WORKER_URL } = require('./helpers/setup-page');

/**
 * End-to-end regression tests for the TCF practice website.
 *
 * These run against the real, unmodified repository root (index.html,
 * dist/app.js) served over local HTTP — the same static architecture used
 * on GitHub Pages. They protect:
 *   - core quiz behavior (answering, feedback, navigation, scoring)
 *   - Phase 1 accessibility semantics (radiogroup/radio, aria-live,
 *     aria-hidden icons, heading structure)
 *   - Phase 2 Tutor stability (input never resets while typing)
 *   - Phase 3 production build (no Babel, dist/app.js loads and runs)
 */

/** @param {import('@playwright/test').Page} page */
async function collectDiagnostics(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const allRequestUrls = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('requestfailed', (req) => failedRequests.push({ url: req.url(), failure: req.failure()?.errorText }));
  page.on('request', (req) => allRequestUrls.push(req.url()));

  return { consoleErrors, pageErrors, failedRequests, allRequestUrls };
}

// Babel's own "deoptimised" notice does not apply anymore (Babel is gone),
// but keep this filter in case any unrelated third-party noise appears.
function isIgnorableConsoleError(text) {
  return false;
}

test.beforeEach(async ({ page }) => {
  await setupPage(page);
});

test('Home renders with the full question count', async ({ page }) => {
  const diag = await collectDiagnostics(page);
  await page.goto('/index.html');
  await expect(page.locator('body')).toContainText('1322 questions');
  expect(diag.pageErrors).toEqual([]);
});

test('Grammar mode opens with 170 questions', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button.hcard', { hasText: 'Structure de la langue' }).click();
  await expect(page.locator('header span').first()).toHaveText(/sur 170/);
});

test('Reading mode opens with 1152 questions', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button.hcard', { hasText: 'Compréhension écrite' }).click();
  await expect(page.locator('header span').first()).toHaveText(/sur 1152/);
});

test('Quick mode opens with 20 questions', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button:has-text("Mode rapide")').click();
  await expect(page.locator('header span').first()).toHaveText('1 sur 20');
});

test('a quiz displays a question and answer options as an accessible radiogroup', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button:has-text("Mode rapide")').click();

  const radiogroup = page.locator('[role="radiogroup"]');
  await expect(radiogroup).toHaveAttribute('aria-labelledby', 'question-text');

  const options = page.locator('button.opt-row');
  await expect(options).toHaveCount(4);
  for (const role of await options.evaluateAll((els) => els.map((e) => e.getAttribute('role')))) {
    expect(role).toBe('radio');
  }
});

test('selecting an answer updates radio semantics (aria-checked) correctly', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button:has-text("Mode rapide")').click();

  const options = page.locator('button.opt-row');
  const before = await options.evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked')));
  expect(before.every((v) => v === 'false')).toBe(true);

  await options.nth(1).click();

  const after = await options.evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked')));
  expect(after[1]).toBe('true');
  after.forEach((v, i) => {
    if (i !== 1) expect(v).toBe('false');
  });

  // Once answered, options become disabled (no further changes possible).
  const disabledStates = await options.evaluateAll((els) => els.map((e) => e.disabled));
  expect(disabledStates.every(Boolean)).toBe(true);
});

test('correct and incorrect feedback render, and the feedback panel is aria-live="polite"', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button:has-text("Mode rapide")').click();

  await page.locator('button.opt-row').first().click();

  const feedbackPanel = page.locator('[aria-live="polite"]');
  await expect(feedbackPanel).toBeVisible();

  const optionStyles = await page.locator('button.opt-row').evaluateAll((els) => els.map((e) => e.getAttribute('style')));
  const hasGreenOrRed =
    optionStyles.some((s) => s && s.includes('52, 199, 89')) || optionStyles.some((s) => s && s.includes('255, 59, 48'));
  expect(hasGreenOrRed).toBe(true);
});

test('next-question navigation advances the progress indicator', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button:has-text("Mode rapide")').click();
  await expect(page.locator('header span').first()).toHaveText('1 sur 20');

  await page.locator('button.opt-row').first().click();
  await page.locator('button.pill-btn', { hasText: /Continuer|Voir/ }).last().click();

  await expect(page.locator('header span').first()).toHaveText('2 sur 20');
});

test('a complete quick quiz reaches the Result screen with an internally consistent score', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button:has-text("Mode rapide")').click();

  let correctPicks = 0;
  for (let i = 0; i < 20; i++) {
    const progress = page.locator('header span').first();
    if ((await progress.count()) === 0) break;

    const options = page.locator('button.opt-row');
    await options.first().click();

    // Track whether the picked option (index 0) was actually correct, by
    // reading the rendered feedback color, so we can cross-check the final
    // score against our own independent count.
    const style0 = await options.nth(0).getAttribute('style');
    if (style0 && style0.includes('52, 199, 89')) correctPicks++;

    const continueBtn = page.locator('button.pill-btn', { hasText: /Continuer|Voir/ });
    await continueBtn.last().click();
  }

  await expect(page.locator('body')).toContainText(/résultat/i);
  const resultText = await page.locator('body').innerText();
  const match = resultText.match(/(\d+) bonnes réponses sur (\d+)/);
  expect(match).not.toBeNull();
  const [, scoreStr, totalStr] = match;
  expect(Number(totalStr)).toBe(20);
  expect(Number(scoreStr)).toBe(correctPicks);

  const pctMatch = resultText.match(/(\d+)%/);
  expect(pctMatch).not.toBeNull();
  expect(Number(pctMatch[1])).toBe(Math.round((Number(scoreStr) / Number(totalStr)) * 100));

  // Exactly one accessible heading announces the result headline.
  await expect(page.locator('h1')).toHaveCount(1);
});

test('Review opens and shows recorded mistakes', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button:has-text("Mode rapide")').click();
  for (let i = 0; i < 20; i++) {
    const progress = page.locator('header span').first();
    if ((await progress.count()) === 0) break;
    await page.locator('button.opt-row').first().click();
    await page.locator('button.pill-btn', { hasText: /Continuer|Voir/ }).last().click();
  }
  const reviewBtn = page.locator('button', { hasText: 'Revoir mes' });
  if (await reviewBtn.count() > 0) {
    await reviewBtn.first().click();
    await expect(page.locator('body')).toContainText('Mes erreurs');
    await expect(page.locator('h1')).toHaveCount(1);
  }
});

test('Settings opens', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button[aria-label="Réglages"]').click();
  await expect(page.locator('body')).toContainText('Réglages');
  await expect(page.locator('h1')).toHaveCount(1);
});

test('Tutor opens with an accessible heading', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button.hcard', { hasText: 'Tuteur IA' }).click();
  await expect(page.locator('body')).toContainText("Comment puis-je t'aider");
  await expect(page.locator('h1')).toHaveCount(1);
});

test('Tutor input remains mounted and does not reset while typing', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button.hcard', { hasText: 'Tuteur IA' }).click();

  const textarea = page.locator('textarea');
  await textarea.click();
  await textarea.type('Ceci est un test de stabilité.', { delay: 15 });
  await expect(textarea).toHaveValue('Ceci est un test de stabilité.');

  // Give any stray re-render / effect a chance to misbehave.
  await page.waitForTimeout(1000);
  await expect(textarea).toHaveValue('Ceci est un test de stabilité.');

  await textarea.press('Enter');
  await expect(page.locator('body')).toContainText('Réponse simulée à');
  await expect(textarea).toHaveValue('');
});

test('decorative SVG icons remain aria-hidden', async ({ page }) => {
  await page.goto('/index.html');
  const svgCount = await page.locator('svg').count();
  expect(svgCount).toBeGreaterThan(0);
  const hiddenFlags = await page.locator('svg').evaluateAll((els) => els.map((e) => e.getAttribute('aria-hidden')));
  expect(hiddenFlags.every((v) => v === 'true')).toBe(true);
});

test('localStorage progress persists and refreshing does not produce a blank screen', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('button:has-text("Mode rapide")').click();
  for (let i = 0; i < 20; i++) {
    const progress = page.locator('header span').first();
    if ((await progress.count()) === 0) break;
    await page.locator('button.opt-row').first().click();
    await page.locator('button.pill-btn', { hasText: /Continuer|Voir/ }).last().click();
  }
  await expect(page.locator('body')).toContainText(/résultat/i);

  const stored = await page.evaluate(() => localStorage.getItem('tcf_progress_v1'));
  expect(stored).toBeTruthy();

  await page.goto('/index.html');
  await page.reload();
  const bodyText = await page.locator('body').innerText();
  expect(bodyText.trim().length).toBeGreaterThan(100);
  await expect(page.locator('body')).toContainText('1322 questions');
});

test('no console errors, page errors, failed dist/app.js request, or Babel CDN request occur across a full user journey', async ({ page }) => {
  const diag = await collectDiagnostics(page);

  await page.goto('/index.html');
  await page.locator('button:has-text("Mode rapide")').click();
  await page.locator('button.opt-row').first().click();
  await page.locator('button.pill-btn', { hasText: /Continuer|Voir/ }).last().click();
  await page.goto('/index.html');
  await page.locator('button[aria-label="Réglages"]').click();
  await page.goto('/index.html');
  await page.locator('button.hcard', { hasText: 'Tuteur IA' }).click();
  await page.locator('textarea').click();
  await page.locator('textarea').type('bonjour');
  await page.locator('textarea').press('Enter');
  await expect(page.locator('body')).toContainText('Réponse simulée à');

  const relevantConsoleErrors = diag.consoleErrors.filter((e) => !isIgnorableConsoleError(e));
  expect(relevantConsoleErrors).toEqual([]);
  expect(diag.pageErrors).toEqual([]);

  const failedDistRequest = diag.failedRequests.filter((r) => r.url.includes('dist/app.js'));
  expect(failedDistRequest).toEqual([]);

  const babelRequests = diag.allRequestUrls.filter((u) => u.toLowerCase().includes('babel'));
  expect(babelRequests).toEqual([]);
});
