/**
 * Isolate this session's dark-theme impact from content drift.
 *
 * `verify-dark-identical.mjs` compares `before` (captured on 2026-10-19) with
 * `after`. Between those runs the CMS photography and seeded content changed, so
 * a difference there is not necessarily this session's doing. This compares the
 * previous session's already-verified `after` (kept as `after-old`) with the new
 * one, so the only variable is the code changed now.
 */
import sharp from 'sharp';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const OLD = 'docs/audit/exec07/phase-e/after-old';
const NEW = 'docs/audit/exec07/phase-e/after';
const files = readdirSync(NEW).filter((f) => f.endsWith('-dark.png')).sort();

let real = 0;
const rows = [];
for (const file of files) {
  if (!existsSync(resolve(OLD, file))) continue;
  const a = await sharp(resolve(OLD, file)).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(resolve(NEW, file)).raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    console.log(`SIZE MISMATCH ${file} ${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height}`);
    continue;
  }
  let moved = 0;
  let strict = 0;
  let max = 0;
  const ch = a.info.channels;
  for (let i = 0; i < a.data.length; i += ch) {
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
    );
    if (d > 0) moved += 1;
    if (d > 12) strict += 1;
    if (d > max) max = d;
  }
  const px = a.data.length / ch;
  const pctStrict = (strict / px) * 100;
  if (pctStrict > 0.05) real += 1;
  rows.push({ file, moved: ((moved / px) * 100).toFixed(3), strict: pctStrict.toFixed(4), max });
}

rows.sort((x, y) => Number(y.strict) - Number(x.strict));
console.log('after-old vs after (dark only) — isolates this session\'s code change');
for (const r of rows.slice(0, 12)) {
  console.log(`  ${r.file.padEnd(44)} moved=${r.moved}%  strict=${r.strict}%  maxDelta=${r.max}`);
}
console.log(`\n${rows.length} compared; ${real} with a real colour shift (>0.05% strict)`);
