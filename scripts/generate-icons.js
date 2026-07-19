#!/usr/bin/env node
'use strict';

/**
 * One-off developer utility to (re)generate the PWA icon set from a simple
 * SVG template that mirrors the site's existing identity: the same rounded
 * blue square with "B2" already used for the favicon and apple-touch-icon
 * in index.html (see the inline data-URI SVGs there).
 *
 * This script is NOT part of `npm run build` or the test suite — icons are
 * committed directly as static PNG files (Strategy A from the Phase 5
 * plan). Re-run this manually only if the icon design needs to change.
 *
 * Requires the `sharp` package to be available (not a project dependency;
 * install it temporarily to run this script, e.g. `npm install --no-save sharp`).
 *
 * Usage: node scripts/generate-icons.js
 */

const fs = require('node:fs');
const path = require('node:path');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('This script requires the "sharp" package. Install it temporarily with:');
  console.error('  npm install --no-save sharp');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, '..', 'icons');
const BLUE = '#0071e3';
const WHITE = '#ffffff';
const FONT_FAMILY = 'Poppins, -apple-system, system-ui, sans-serif';

function standardIconSvg(size) {
  // Same proportions as the existing 180px apple-touch-icon: rx ≈ 22.2%,
  // font-size ≈ 46.7% of the canvas, vertically centered.
  const rx = Math.round(size * 0.222);
  const fontSize = Math.round(size * 0.467);
  const cx = size / 2;
  const cy = Math.round(size * 0.655);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${BLUE}"/>
  <text x="${cx}" y="${cy}" font-size="${fontSize}" text-anchor="middle" fill="${WHITE}" font-family="${FONT_FAMILY}" font-weight="700">B2</text>
</svg>`;
}

function maskableIconSvg(size) {
  // Maskable icons must fill the canvas edge-to-edge with the background
  // (the OS applies its own mask shape), and keep the important content
  // inside the ~80%-diameter "safe zone" circle so it isn't clipped.
  const fontSize = Math.round(size * 0.34);
  const cx = size / 2;
  const cy = Math.round(size * 0.5 + fontSize * 0.34);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BLUE}"/>
  <text x="${cx}" y="${cy}" font-size="${fontSize}" text-anchor="middle" fill="${WHITE}" font-family="${FONT_FAMILY}" font-weight="700">B2</text>
</svg>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const targets = [
    { file: 'icon-192.png', svg: standardIconSvg(192), size: 192 },
    { file: 'icon-512.png', svg: standardIconSvg(512), size: 512 },
    { file: 'icon-maskable-512.png', svg: maskableIconSvg(512), size: 512 },
  ];

  for (const t of targets) {
    const outPath = path.join(OUT_DIR, t.file);
    await sharp(Buffer.from(t.svg), { density: 384 })
      .resize(t.size, t.size)
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    console.log('Wrote', outPath);
  }
}

main();
