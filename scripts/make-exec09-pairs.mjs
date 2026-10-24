/**
 * Build the Execution 09 light-vs-dark comparison sheets.
 *
 * The owner asked for a light/dark comparison, so each surface gets one
 * side-by-side sheet: light on the left, dark on the right, at the same
 * viewport and locale. That makes "the corrected light theme is professional
 * and the approved dark theme is unchanged" visible in a single image.
 *
 * Input:  docs/audit/exec09/screenshots/compare-<surface>-<viewport>-<dir>-<theme>.png
 * Output: docs/audit/exec09/comparisons/<surface>-<viewport>-<dir>.png
 *
 * Run with: node scripts/make-exec09-pairs.mjs
 */
import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve('docs/audit/exec09/screenshots');
const OUT = resolve('docs/audit/exec09/comparisons');
mkdirSync(OUT, { recursive: true });

const SURFACES = [
  ['homepage', 'desktop', 'rtl'],
  ['homepage', 'tablet', 'rtl'],
  ['homepage', 'mobile', 'rtl'],
  ['homepage', 'desktop', 'ltr'],
];

function label(text, width) {
  const svg = `<svg width="${width}" height="34" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="34" fill="#1b1b1b"/>
    <text x="12" y="23" font-family="monospace" font-size="16" fill="#f5f0e6">${text}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

let built = 0;
for (const [surface, viewport, dir] of SURFACES) {
  const lightPath = resolve(DIR, `compare-${surface}-${viewport}-${dir}-light.png`);
  const darkPath = resolve(DIR, `compare-${surface}-${viewport}-${dir}-dark.png`);
  if (!existsSync(lightPath) || !existsSync(darkPath)) {
    console.log(`skip ${surface}-${viewport}-${dir}: missing capture`);
    continue;
  }
  const light = sharp(lightPath);
  const dark = sharp(darkPath);
  const { width: lw, height: lh } = await light.metadata();
  const { width: dw, height: dh } = await dark.metadata();
  const gap = 24;
  const totalW = lw + gap + dw;
  const totalH = Math.max(lh, dh) + 34;
  const lightLabel = await label('LIGHT (corrected)', lw);
  const darkLabel = await label('DARK (approved, unchanged)', dw);

  const out = resolve(OUT, `${surface}-${viewport}-${dir}.png`);
  await sharp({ create: { width: totalW, height: totalH, channels: 3, background: '#0d0d0d' } })
    .composite([
      { input: lightLabel, left: 0, top: 0 },
      { input: darkLabel, left: lw + gap, top: 0 },
      { input: await light.toBuffer(), left: 0, top: 34 },
      { input: await dark.toBuffer(), left: lw + gap, top: 34 },
    ])
    .png()
    .toFile(out);
  console.log(out);
  built += 1;
}
console.log(`\n${built} comparison sheet(s) written to ${OUT}`);
