/**
 * TASK 3 — dashboard card / module-tile asset inventory.
 *
 * Reads the live module catalogue and the dashboard service's tile list, then
 * resolves each tile to the asset the browser will request. Reports, for every
 * card:
 *   - the module key and bilingual label
 *   - the declared tile image and the resolved URL
 *   - whether the asset exists on disk
 *   - whether the asset is a raster crop (the retired practice) or original SVG
 *   - a SHA-256 of the file, so two cards cannot silently share one visual
 *
 * A non-zero exit means at least one card is broken, missing or raster.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODULES } from '../packages/shared/dist/index.js';

const ROOT = resolve(import.meta.dirname, '..');
const TILES_DIR = resolve(ROOT, 'apps/admin/public/tiles');

const modules = MODULES.map((m) => ({
  key: m.key,
  nameEn: m.nameEn,
  nameAr: m.nameAr,
  tileImage: m.tileImage,
  route: m.route,
  status: m.status,
  group: m.group,
}));

const rows = [];
const problems = [];
const hashes = new Map();

for (const m of modules) {
  const file = resolve(TILES_DIR, `${m.tileImage}.svg`);
  const url = `/tiles/${m.tileImage}.svg`;
  const exists = existsSync(file);
  let hash = null;
  let raster = false;
  let bytes = null;
  if (exists) {
    const buf = readFileSync(file);
    bytes = buf.length;
    hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const head = buf.subarray(0, 256).toString('utf8');
    raster = !head.includes('<svg');
    if (hashes.has(hash)) {
      problems.push(`${m.key}: asset ${m.tileImage}.svg is byte-identical to ${hashes.get(hash)}`);
    } else {
      hashes.set(hash, m.key);
    }
  } else {
    problems.push(`${m.key}: asset ${m.tileImage}.svg is MISSING`);
  }
  if (raster) problems.push(`${m.key}: asset ${m.tileImage}.svg is not an SVG document`);

  rows.push({ key: m.key, nameEn: m.nameEn, nameAr: m.nameAr, route: m.route, tileImage: m.tileImage, url, exists, raster, bytes, sha256_16: hash });
}

// Any raster file left in the tile directory at all is a defect.
const stray = [];
for (const f of readdirSync(TILES_DIR)) {
  if (!/\.(svg)$/i.test(f)) stray.push(f);
}
if (stray.length) problems.push(`raster or non-SVG files present in tiles/: ${stray.join(', ')}`);

const report = {
  generatedAt: new Date().toISOString(),
  tilesDirectory: 'apps/admin/public/tiles',
  moduleCount: rows.length,
  svgCount: rows.filter((r) => r.exists && !r.raster).length,
  rasterCount: rows.filter((r) => r.raster).length,
  missingCount: rows.filter((r) => !r.exists).length,
  strayNonSvg: stray,
  uniqueAssets: hashes.size,
  cards: rows,
  problems,
};

const outDir = resolve(ROOT, 'docs/audit/evidence');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'dashboard-card-inventory.json'), JSON.stringify(report, null, 2));

console.log(`Dashboard card inventory — ${rows.length} cards`);
for (const r of rows) {
  console.log(
    `  ${r.exists && !r.raster ? 'OK  ' : 'FAIL'} ${r.key.padEnd(22)} ${r.tileImage.padEnd(22)} ${r.bytes ?? '-'}B ${r.sha256_16 ?? '-'}`,
  );
}
console.log(`unique assets: ${hashes.size} / ${rows.length} cards`);
if (problems.length) {
  console.log('\nPROBLEMS:');
  for (const p of problems) console.log(`  - ${p}`);
} else {
  console.log('\nNo problems: every card maps to its own original SVG asset.');
}


process.exit(problems.length ? 1 : 0);
