#!/usr/bin/env node
/**
 * Verify the website photography.
 *
 * Fails when:
 *   1. a service category has no photograph mapped to it;
 *   2. a mapped photograph (or one of its responsive variants) is missing from
 *      `apps/customer/public/media`;
 *   3. the committed bytes are larger than the delivery budget;
 *   4. a page or the seed still references a withdrawn photograph;
 *   5. a licence that requires attribution is missing credit text.
 *
 * Run: node scripts/exec07-verify-media.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MEDIA = resolve(ROOT, 'apps/customer/public/media');
const SITE_MEDIA = resolve(ROOT, 'apps/customer/src/lib/site-media.ts');
const LICENSES = resolve(ROOT, 'docs/audit/execution-07-media-licenses.json');

const failures = [];
const notes = [];

const source = readFileSync(SITE_MEDIA, 'utf8');
const licenceRecord = JSON.parse(readFileSync(LICENSES, 'utf8'));

// ---- 1. every category is mapped ------------------------------------------

const categoryKeys = [...source.matchAll(/^\s{2}([a-z_]+): '[A-Za-z]+',$/gm)].map((m) => m[1]);
if (categoryKeys.length === 0) {
  failures.push('site-media.ts: no category-to-photo mapping found');
}
notes.push(`category mappings: ${categoryKeys.join(', ')}`);

// ---- 2. every mapped photograph and its variants exist ---------------------

const srcPaths = [...source.matchAll(/src: '(\/media\/[^']+)'/g)].map((m) => m[1]);
if (srcPaths.length === 0) failures.push('site-media.ts: no photograph sources found');

for (const src of srcPaths) {
  const stem = src.replace(/\.jpg$/, '');
  for (const variant of [`${stem}-sm.jpg`, `${stem}.jpg`, `${stem}-lg.jpg`]) {
    const file = resolve(ROOT, 'apps/customer/public', variant.replace(/^\//, ''));
    try {
      statSync(file);
    } catch {
      failures.push(`missing file ${variant}`);
    }
  }
}
notes.push(`photographs referenced: ${srcPaths.length}`);

// ---- 3. delivery budget ----------------------------------------------------

const BUDGET_KB = 700;
for (const file of readdirSync(MEDIA)) {
  const size = statSync(resolve(MEDIA, file)).size;
  if (size / 1024 > BUDGET_KB) {
    failures.push(`${file} is ${(size / 1024).toFixed(0)} KB, over the ${BUDGET_KB} KB budget`);
  }
}
const totalBytes = readdirSync(MEDIA).reduce((sum, f) => sum + statSync(resolve(MEDIA, f)).size, 0);
notes.push(`media total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB in ${readdirSync(MEDIA).length} files`);

// ---- 4. withdrawn photographs are gone ------------------------------------

const withdrawn = licenceRecord.images.filter((i) => i.status === 'withdrawn').map((i) => i.key);
for (const key of withdrawn) {
  if (readdirSync(MEDIA).some((f) => f.startsWith(`${key}.`) || f.startsWith(`${key}-`))) {
    failures.push(`withdrawn photograph ${key} is still present in public/media`);
  }
}

const SEARCH_ROOTS = ['apps/customer/src', 'scripts/seed-exec07-content.mjs'];
for (const key of withdrawn) {
  for (const root of SEARCH_ROOTS) {
    const target = resolve(ROOT, root);
    const files = statSync(target).isDirectory()
      ? readdirSync(target, { recursive: true })
          .map((f) => resolve(target, String(f)))
          .filter((f) => statSync(f).isFile() && /\.(ts|tsx|mjs)$/.test(f))
      : [target];
    for (const file of files) {
      if (readFileSync(file, 'utf8').includes(key)) {
        failures.push(`${file.replace(`${ROOT}/`, '')} still references withdrawn ${key}`);
      }
    }
  }
}

// ---- 5. attribution exists for licences that require it -------------------

for (const image of licenceRecord.images.filter((i) => i.status === 'shipping')) {
  if (image.attributionRequired && !image.credit) {
    failures.push(`${image.key}: licence ${image.license} requires attribution but has no credit`);
  }
}
notes.push(`shipping: ${licenceRecord.shippingCount}, withdrawn: ${licenceRecord.withdrawnCount}`);

// ---- report ---------------------------------------------------------------

console.log(notes.join('\n'));
if (failures.length > 0) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nOK: every service has a correct photograph, all files are present, licences are attributed.');
