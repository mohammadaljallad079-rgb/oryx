/**
 * Pixel-diff two capture sets to prove the dark theme did not move.
 *
 * The brief requires the approved dark theme to stay intact while the light
 * theme is corrected. This walks both sets, samples a grid of pixels and reports
 * the share that changed by more than a just-noticeable step. The dark captures
 * should be at or near zero; the light captures are expected to change.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const BEFORE = process.env.ORYX_BEFORE ?? '/tmp/oryx-light/captures';
const AFTER = process.env.ORYX_AFTER ?? '/tmp/oryx-light/captures-after';

function diff(a, b) {
  const p1 = PNG.sync.read(readFileSync(a));
  const p2 = PNG.sync.read(readFileSync(b));
  if (p1.width !== p2.width || p1.height !== p2.height) return null;
  const { width, height, data: d1 } = p1;
  const d2 = p2.data;
  const stepX = Math.max(1, Math.floor(width / 400));
  const stepY = Math.max(1, Math.floor(height / 400));
  let changed = 0;
  let total = 0;
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (width * y + x) << 2;
      total += 1;
      const delta =
        Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
      if (delta > 12) changed += 1;
    }
  }
  return (changed / total) * 100;
}

const files = readdirSync(BEFORE).filter((f) => f.endsWith('.png')).sort();
const rows = [];
for (const f of files) {
  const b = join(AFTER, f);
  if (!existsSync(b)) continue;
  const pct = diff(join(BEFORE, f), b);
  rows.push({ f, pct });
}

const fmt = (r) => (r.pct === null ? 'size changed' : `${r.pct.toFixed(2)}%`);
console.log('LIGHT captures (expected to change):');
for (const r of rows.filter((r) => r.f.includes('-light-'))) console.log(`  ${r.f.padEnd(44)}${fmt(r)}`);
console.log('\nDARK captures (must stay intact):');
const dark = rows.filter((r) => r.f.includes('-dark-'));
for (const r of dark) console.log(`  ${r.f.padEnd(44)}${fmt(r)}`);

const worst = Math.max(...dark.map((r) => (r.pct === null ? 100 : r.pct)));
console.log(`\nworst dark-theme change: ${worst.toFixed(2)}%`);
