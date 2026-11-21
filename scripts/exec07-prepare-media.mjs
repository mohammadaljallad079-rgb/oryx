#!/usr/bin/env node
/**
 * Prepare the ORYX website photography.
 *
 * Two jobs:
 *
 * 1. Relevance. Every photograph must show the service it illustrates. The two
 *    dealership showroom shots (a Bentley dealership and a Jaguar showroom) are
 *    replaced by a real service workshop, so the homepage hero no longer shows
 *    an unrelated luxury marque.
 * 2. Delivery. The originals were 1–4 MB camera files. Each kept photograph is
 *    re-encoded to three widths (`-sm` 800, default 1600, `-lg` 2400) so the
 *    site can ship a `srcset`, and all EXIF/GPS is dropped.
 *
 * Sources and licences are recorded in docs/audit/execution-07-media-licenses.json.
 * Run: node scripts/exec07-prepare-media.mjs [--only <key>]
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MEDIA = resolve(ROOT, 'apps/customer/public/media');

/**
 * Each entry maps a committed asset key to the file the site serves.
 *
 * `source` is the downloaded original kept outside the repository (under
 * `.run/media-source/`); a missing original means the committed file is already
 * the prepared output and is re-encoded in place.
 */
const PHOTOS = [
  { key: 'auto-service', max: 2400 },
  { key: 'garage-interior', max: 2000 },
  { key: 'inspection-bay', max: 2000 },
  { key: 'mechanic-engine', max: 2000 },
  { key: 'parts-store', max: 2000 },
  { key: 'recovery-tow', max: 2000 },
  { key: 'carwash-premium', max: 2000 },
  { key: 'garage-brastad', max: 2000 },
  { key: 'workshop-artdeco', max: 2000 },
  { key: 'ev-charging', max: 2000 },
];

/** Photographs withdrawn because they did not represent the service. */
const WITHDRAWN = ['hero-showroom', 'showroom-jaguar'];

const SOURCE_DIR = resolve(ROOT, '.run/media-source');

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx === -1 ? null : process.argv[onlyIdx + 1];

mkdirSync(MEDIA, { recursive: true });

/** A source original if one was downloaded, else the committed file. */
function inputFor(key) {
  const original = resolve(SOURCE_DIR, `${key}.jpg`);
  if (existsSync(original)) return original;
  const committed = resolve(MEDIA, `${key}.jpg`);
  if (existsSync(committed)) return committed;
  throw new Error(`No source for ${key}; expected ${original} or ${committed}`);
}

async function writeVariant(input, out, width) {
  const info = await sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true, mozjpeg: true })
    .toFile(out);
  return info;
}

const report = [];
for (const photo of PHOTOS) {
  if (only && photo.key !== only) continue;
  const input = inputFor(photo.key);
  const widths = [
    { suffix: '-sm', width: 800 },
    { suffix: '', width: 1600 },
    { suffix: '-lg', width: photo.max },
  ];
  const written = [];
  for (const variant of widths) {
    const out = resolve(MEDIA, `${photo.key}${variant.suffix}.jpg`);
    const info = await writeVariant(input, out, variant.width);
    written.push(`${info.width}w/${(info.size / 1024).toFixed(0)}KB`);
  }
  const bytes = written.reduce((sum, w) => sum + Number(w.split('/')[1].replace('KB', '')), 0);
  report.push(`${photo.key.padEnd(18)} ${written.join('  ')}`);
}

for (const key of WITHDRAWN) {
  const file = resolve(MEDIA, `${key}.jpg`);
  if (existsSync(file)) {
    rmSync(file);
    report.push(`${key.padEnd(18)} withdrawn (did not represent the service)`);
  }
}

console.log(report.join('\n'));

// A stray variant for a withdrawn key would still be served by a stale srcset.
for (const file of readdirSync(MEDIA)) {
  const stem = file.replace(/(-sm|-lg)?\.jpg$/, '');
  if (WITHDRAWN.includes(stem)) {
    rmSync(resolve(MEDIA, file));
    console.log(`removed stale variant ${file}`);
  }
}

const total = readdirSync(MEDIA)
  .filter((f) => f.endsWith('.jpg'))
  .reduce((sum, f) => sum + statSync(resolve(MEDIA, f)).size, 0);
console.log(`\nmedia total: ${(total / 1024 / 1024).toFixed(2)} MB across ${readdirSync(MEDIA).filter((f) => f.endsWith('.jpg')).length} files`);
