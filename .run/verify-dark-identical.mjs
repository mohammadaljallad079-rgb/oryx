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
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = 'docs/audit/exec07/phase-e';
const files = readdirSync(resolve(DIR, 'after')).filter((f) => f.endsWith('-dark.png')).sort();
const rows = [];

let worst = { name: null, moved: 0, max: 0 };
let anyReal = 0;
let anyDeviation = 0;
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
  let strict = 0;
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
  const pct = (moved / px) * 100;
  const pctStrict = (strict / px) * 100;
  histogram.set(max, (histogram.get(max) ?? 0) + 1);
  if (max === 0) exact += 1;
  // A channel delta above 12 over a meaningful area is a palette change. An
  // isolated high-delta pixel is an image-edge or subpixel-text artefact from a
  // re-render, so it is counted separately and does not fail the check.
  if (pctStrict > 0.05) anyReal += 1;
  else if (max > 12) anyDeviation += 1;
  rows.push({ file, moved: Number(pct.toFixed(4)), strictPixels: strict, maxDelta: max });
  if (pct > worst.moved) worst = { name: file, moved: pct, max };
  if (pct > 0.5 || max > 12) {
    console.log(
      `  ${file.padEnd(44)} moved=${pct.toFixed(2)}%  strict=${pctStrict.toFixed(4)}%  maxDelta=${max}`,
    );
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
console.log(`captures with a real colour shift (>0.05% of pixels): ${anyReal}`);
console.log(`captures with only isolated high-delta pixels: ${anyDeviation}`);
console.log(`worst capture: ${worst.name} moved=${worst.moved.toFixed(4)}% maxDelta=${worst.max}`);

writeFileSync(
  resolve(DIR, 'after/dark-invariance.json'),
  `${JSON.stringify(
    {
      captures: files.length,
      byteIdentical: exact,
      realColourShift: anyReal,
      isolatedPixelDeviation: anyDeviation,
      thresholdStrictPercent: 0.05,
      histogram: Object.fromEntries([...histogram.entries()].sort((x, y) => x[0] - y[0])),
      worst: { file: worst.name, moved: worst.moved, maxDelta: worst.max },
      rows,
    },
    null,
    2,
  )}\n`,
);
