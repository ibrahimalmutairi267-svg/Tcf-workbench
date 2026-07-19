'use strict';

/**
 * Data-integrity regression tests.
 *
 * These tests protect the TCF question bank (QUESTIONS + READING) against
 * accidental changes introduced by future refactors, build-tooling changes,
 * or merges. They are intentionally strict and read-only:
 *
 *   - They never rewrite, repair, normalize, sort, or mutate any data.
 *   - Any detected difference from the approved baseline is treated as a
 *     regression to report, not something to silently fix.
 *
 * Run with: node tests/data-integrity.test.js
 * (uses Node's built-in test runner — no extra dependency required)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { loadAppData } = require('./helpers/load-app-data');

const BASELINE_PATH = path.join(__dirname, 'fixtures', 'data-integrity-baseline.json');

const EXPECTED_QUESTIONS_COUNT = 170;
const EXPECTED_READING_COUNT = 1152;
const EXPECTED_TOTAL_COUNT = 1322;

const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  return JSON.stringify(value);
}

// Load once and share across all tests in this file — the data never
// changes between assertions, and re-loading per test would just be slower.
const { QUESTIONS, READING, ALL, GRAMMAR_COUNT, READING_COUNT } = loadAppData();
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));

test('QUESTIONS has exactly 170 entries', () => {
  assert.equal(QUESTIONS.length, EXPECTED_QUESTIONS_COUNT);
});

test('READING has exactly 1152 entries', () => {
  assert.equal(READING.length, EXPECTED_READING_COUNT);
});

test('ALL has exactly 1322 entries (QUESTIONS + READING)', () => {
  assert.equal(ALL.length, EXPECTED_TOTAL_COUNT);
  assert.equal(ALL.length, QUESTIONS.length + READING.length);
});

test('GRAMMAR_COUNT and READING_COUNT mirror QUESTIONS/READING lengths', () => {
  assert.equal(GRAMMAR_COUNT, QUESTIONS.length);
  assert.equal(READING_COUNT, READING.length);
});

test('ALL preserves ordering: QUESTIONS first, then READING, with sequential ids', () => {
  for (let i = 0; i < QUESTIONS.length; i++) {
    assert.equal(ALL[i].type, 'grammar', `ALL[${i}] should be a grammar (QUESTIONS) entry`);
    assert.equal(ALL[i].id, i);
    assert.equal(ALL[i].sentence, QUESTIONS[i].sentence);
    assert.equal(ALL[i].correct, QUESTIONS[i].correct);
    assert.deepEqual(ALL[i].options, QUESTIONS[i].options);
  }
  for (let i = 0; i < READING.length; i++) {
    const allIndex = QUESTIONS.length + i;
    assert.equal(ALL[allIndex].type, 'reading', `ALL[${allIndex}] should be a reading entry`);
    assert.equal(ALL[allIndex].id, allIndex);
    assert.equal(ALL[allIndex].passage, READING[i].passage);
    assert.equal(ALL[allIndex].question, READING[i].question);
    assert.equal(ALL[allIndex].correct, READING[i].correct);
    assert.deepEqual(ALL[allIndex].options, READING[i].options);
  }
});

test('every QUESTIONS entry has the expected required structure', () => {
  QUESTIONS.forEach((q, i) => {
    assert.equal(typeof q.level, 'string', `QUESTIONS[${i}].level should be a string`);
    assert.ok(VALID_LEVELS.has(q.level), `QUESTIONS[${i}].level "${q.level}" is not a recognized CEFR level`);
    assert.equal(typeof q.sentence, 'string', `QUESTIONS[${i}].sentence should be a string`);
    assert.ok(q.sentence.length > 0, `QUESTIONS[${i}].sentence should not be empty`);
    assert.ok(Array.isArray(q.options), `QUESTIONS[${i}].options should be an array`);
    assert.ok(q.options.length >= 2, `QUESTIONS[${i}].options should have at least 2 choices`);
    assert.ok(
      q.options.every((o) => typeof o === 'string'),
      `QUESTIONS[${i}].options should all be strings`
    );
    assert.equal(typeof q.rule, 'string', `QUESTIONS[${i}].rule should be a string`);
    assert.ok(Array.isArray(q.why), `QUESTIONS[${i}].why should be an array`);
  });
});

test('every READING entry has the expected required structure', () => {
  READING.forEach((q, i) => {
    assert.equal(typeof q.level, 'string', `READING[${i}].level should be a string`);
    assert.ok(VALID_LEVELS.has(q.level), `READING[${i}].level "${q.level}" is not a recognized CEFR level`);
    assert.equal(typeof q.passage, 'string', `READING[${i}].passage should be a string`);
    assert.ok(q.passage.length > 0, `READING[${i}].passage should not be empty`);
    assert.equal(typeof q.question, 'string', `READING[${i}].question should be a string`);
    assert.ok(q.question.length > 0, `READING[${i}].question should not be empty`);
    assert.ok(Array.isArray(q.options), `READING[${i}].options should be an array`);
    assert.ok(q.options.length >= 2, `READING[${i}].options should have at least 2 choices`);
    assert.equal(typeof q.rule, 'string', `READING[${i}].rule should be a string`);
    assert.ok(Array.isArray(q.why), `READING[${i}].why should be an array`);
  });
});

test('every correct-answer index is valid for its own options array (QUESTIONS)', () => {
  QUESTIONS.forEach((q, i) => {
    assert.equal(typeof q.correct, 'number', `QUESTIONS[${i}].correct should be a number`);
    assert.ok(Number.isInteger(q.correct), `QUESTIONS[${i}].correct should be an integer`);
    assert.ok(q.correct >= 0 && q.correct < q.options.length, `QUESTIONS[${i}].correct (${q.correct}) is out of bounds for ${q.options.length} options`);
  });
});

test('every correct-answer index is valid for its own options array (READING)', () => {
  READING.forEach((q, i) => {
    assert.equal(typeof q.correct, 'number', `READING[${i}].correct should be a number`);
    assert.ok(Number.isInteger(q.correct), `READING[${i}].correct should be an integer`);
    assert.ok(q.correct >= 0 && q.correct < q.options.length, `READING[${i}].correct (${q.correct}) is out of bounds for ${q.options.length} options`);
  });
});

test('ALL entries expose valid, in-bounds ids usable by the application', () => {
  const seenIds = new Set();
  ALL.forEach((q, i) => {
    assert.equal(typeof q.id, 'number', `ALL[${i}].id should be a number`);
    assert.equal(q.id, i, `ALL[${i}].id should equal its own array index`);
    assert.ok(!seenIds.has(q.id), `ALL contains a duplicate id: ${q.id}`);
    seenIds.add(q.id);
  });
  assert.equal(seenIds.size, EXPECTED_TOTAL_COUNT);
});

test('baseline fixture metadata matches current counts', () => {
  assert.equal(baseline.questionsCount, QUESTIONS.length);
  assert.equal(baseline.readingCount, READING.length);
  assert.equal(baseline.totalCount, ALL.length);
});

test('QUESTIONS checksum matches the approved baseline (detects any content or ordering change)', () => {
  const actual = `sha256:${sha256(canonicalize(QUESTIONS))}`;
  assert.equal(
    actual,
    baseline.questionsChecksum,
    'QUESTIONS content/order changed since the approved baseline. ' +
      'If this change was intentional and approved, regenerate the baseline with ' +
      '"node tests/generate-baseline.js" and commit it as a separate, reviewed change.'
  );
});

test('READING checksum matches the approved baseline (detects any content or ordering change)', () => {
  const actual = `sha256:${sha256(canonicalize(READING))}`;
  assert.equal(
    actual,
    baseline.readingChecksum,
    'READING content/order changed since the approved baseline. ' +
      'If this change was intentional and approved, regenerate the baseline with ' +
      '"node tests/generate-baseline.js" and commit it as a separate, reviewed change.'
  );
});

test('combined ALL checksum matches the approved baseline', () => {
  const actual = `sha256:${sha256(canonicalize(ALL))}`;
  assert.equal(actual, baseline.allChecksum);
});
