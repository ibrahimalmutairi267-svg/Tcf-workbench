'use strict';

/**
 * Developer utility — NOT run automatically by `npm test`.
 *
 * Regenerates tests/fixtures/data-integrity-baseline.json from the current
 * build output. This should only ever be run intentionally, after a human
 * has reviewed and approved a real, deliberate content change to QUESTIONS
 * or READING (e.g. a new officially-approved batch of TCF questions).
 *
 * Usage:
 *   npm run build
 *   node tests/generate-baseline.js
 *
 * The checksum baseline currently committed to this repository was
 * generated from commit c38f44361f7bc9ffacb39a618364da6de86b4185
 * (feature/phase-3-production-build), which is the trusted data baseline
 * for the TCF question bank as of Phase 4.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadAppData } = require('./helpers/load-app-data');

const BASELINE_PATH = path.join(__dirname, 'fixtures', 'data-integrity-baseline.json');
const BASELINE_COMMIT = 'c38f44361f7bc9ffacb39a618364da6de86b4185';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Canonical, order-preserving serialization. JSON.stringify preserves both
// array order and (for these plain string-keyed object literals) insertion
// order of object keys, so this is sensitive to any change in wording,
// options, correct-answer indexes, why arrays, or ordering.
function canonicalize(value) {
  return JSON.stringify(value);
}

function main() {
  const { QUESTIONS, READING, ALL } = loadAppData();

  const questionsChecksum = sha256(canonicalize(QUESTIONS));
  const readingChecksum = sha256(canonicalize(READING));
  const allChecksum = sha256(canonicalize(ALL));

  const baseline = {
    description:
      'Checksum baseline protecting the TCF question/reading data from unintended changes. ' +
      'Regenerate only after an intentional, human-approved content change.',
    generatedFromCommit: BASELINE_COMMIT,
    questionsCount: QUESTIONS.length,
    readingCount: READING.length,
    totalCount: ALL.length,
    questionsChecksum: `sha256:${questionsChecksum}`,
    readingChecksum: `sha256:${readingChecksum}`,
    allChecksum: `sha256:${allChecksum}`,
  };

  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log('Baseline written to', BASELINE_PATH);
  console.log(JSON.stringify(baseline, null, 2));
}

main();
