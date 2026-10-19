/**
 * Strict before/after comparison of the Phase E dark captures.
 *
 * The Phase E change must leave the approved dark theme untouched. This reports,
 * per capture, the exact byte count of differing pixels and the largest channel
 * delta, so "unchanged" is a measurement rather than an impression. A tiny
 * non-zero count from text antialiasing is called out separately from a real
 * colour shift.
 *
 * Run with: node .run/verify-dark-identical.mjs
 */
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = 'docs/audit/exec07/phase-e';
const files = readdirSync(resolve(DIR, 'after')).filter((f) => f.endsWith('-dark.png')).sort();

let worst = { name: null, moved: 0, max: 0 };
let anyReal = 0;
let exact = 0;
const histogram = new Map();

for (const file of files) {
  const a = await sharp(resolve(DIR, 'before', file)).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(resolve(DIR, 'after', file)).raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    console.log(`SIZE MISMATCH ${file}`);
    continue;
  }
  let moved = 0;
  let max = 0;
  const ch = a.info.channels;
  for (let i = 0; i < a.data.length; i += ch) {
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
    );
    if (d > 0) moved += 1;
    if (d > max) max = d;
  }
  const px = a.data.length / ch;
  const pct = (moved / px) * 100;
  histogram.set(max, (histogram.get(max) ?? 0) + 1);
  if (max === 0) exact += 1;
  // A channel delta above 12 is a palette change; below it, subpixel text
  // antialiasing from a re-render.
  if (max > 12) anyReal += 1;
  if (pct > worst.moved) worst = { name: file, moved: pct, max };
  if (pct > 0.5 || max > 12) {
    console.log(`  ${file.padEnd(44)} moved=${pct.toFixed(2)}%  maxDelta=${max}`);
  }
}

console.log(`\n${files.length} dark captures compared`);
console.log(`byte-identical captures: ${exact}/${files.length}`);
console.log(
  `max-channel-delta histogram: ${[...histogram.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([d, n]) => `delta ${d}: ${n}`)
    .join(', ')}`,
);
console.log(`captures with a channel delta > 12 (real colour shift): ${anyReal}`);
console.log(`worst capture: ${worst.name} moved=${worst.moved.toFixed(4)}% maxDelta=${worst.max}`);
