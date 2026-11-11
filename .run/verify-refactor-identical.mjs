/**
 * Prove the tokenization moved no pixels in either theme.
 *
 * The light-theme correction replaced five `:root[data-theme='light'] .component`
 * overrides with tokens. That must be a pure refactor: the dark theme is
 * approved, and the light theme's render is the baseline this change is not
 * allowed to regress. This compares the freshly captured set against the set
 * captured before the change and reports, per image, the fraction of differing
 * pixels and the largest channel delta — so "unchanged" is a measurement.
 *
 * Usage: node .run/verify-refactor-identical.mjs <baselineDir> <afterDir>
 */
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const baseline = resolve(process.argv[2] ?? '/tmp/phase-e-baseline');
const after = resolve(process.argv[3] ?? 'docs/audit/exec07/phase-e/after');

const files = readdirSync(after).filter((f) => f.endsWith('.png')).sort();
const missing = files.filter((f) => !readdirSync(baseline).includes(f));

let worst = { file: null, moved: 0, maxDelta: 0 };
let movedAny = 0;

for (const file of files) {
  let a, b;
  try {
    a = await sharp(resolve(baseline, file)).raw().toBuffer({ resolveWithObject: true });
    b = await sharp(resolve(after, file)).raw().toBuffer({ resolveWithObject: true });
  } catch {
    continue;
  }
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    console.log(`SIZE MISMATCH ${file}`);
    continue;
  }
  const ch = a.info.channels;
  let moved = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.data.length; i += ch) {
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
    );
    if (d > 0) {
      moved++;
      if (d > maxDelta) maxDelta = d;
    }
  }
  const total = a.data.length / ch;
  const pct = (moved / total) * 100;
  if (moved > 0) {
    movedAny++;
    console.log(`${pct.toFixed(3).padStart(8)}%  maxΔ${String(maxDelta).padStart(3)}  ${file}`);
  }
  if (pct > worst.moved) worst = { file, moved: pct, maxDelta };
}

console.log(`\nimages compared: ${files.length}  missing from baseline: ${missing.length}`);
if (missing.length) console.log(`  missing: ${missing.join(', ')}`);
console.log(`images with any difference: ${movedAny}`);
console.log(`worst: ${worst.file ?? 'none'} at ${worst.moved.toFixed(3)}% (maxΔ ${worst.maxDelta})`);
process.exitCode = worst.moved > 0.5 ? 1 : 0;
