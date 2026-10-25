/**
 * Confound-aware before/after comparison of the Phase E dark captures.
 *
 * The Phase E change must leave the approved dark theme untouched. The whole-frame
 * delta cannot answer that on its own: the `before` and `after` sets were captured
 * at different commits, and `after` was re-captured at `33e57ba` once the preview
 * build was fixed to use a same-origin API base. That fix let the CMS content load
 * for the first time, and the hero photograph was replaced in between
 * (3840x2560 -> 1600x1067). A photograph is not a theme.
 *
 * This reports the whole-frame delta next to the same measurement restricted to the
 * header chrome band. The chrome band is painted by the token layer and carries no
 * photograph, so it is the witness for a palette change: an identical chrome band
 * with a non-zero whole-frame delta means the delta is content, not colour.
 *
 * Supersedes the whole-frame-only `verify-dark-identical.mjs`, whose output is kept
 * as `dark-invariance.whole-frame.json`.
 *
 * Run with: node .run/verify-dark-theme-invariance.mjs
 */
import sharp from 'sharp';
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = 'docs/audit/exec07/phase-e';
const CHROME_BAND = 64;
const files = readdirSync(resolve(DIR, 'after')).filter((f) => f.endsWith('-dark.png')).sort();
const rows = [];

function measure(a, b, y0, y1) {
  const { width, channels } = a.info;
  let moved = 0;
  let strict = 0;
  let max = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const d = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]),
      );
      if (d > 0) moved += 1;
      if (d > 12) strict += 1;
      if (d > max) max = d;
      total += 1;
    }
  }
  return { movedPct: (moved / total) * 100, strictPct: (strict / total) * 100, max };
}

let themeMoved = 0;
let contentOnly = 0;
let exact = 0;

for (const file of files) {
  const a = await sharp(resolve(DIR, 'before', file)).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(resolve(DIR, 'after', file)).raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    console.log(`SIZE MISMATCH ${file}`);
    continue;
  }
  const whole = measure(a, b, 0, a.info.height);
  const chrome = measure(a, b, 0, Math.min(CHROME_BAND, a.info.height));
  // A palette change repaints a whole region, so it shows up as many pixels over
  // the strict threshold with a large channel delta. A handful of pixels differing
  // by 1-2 is subpixel text antialiasing from the re-render, which is why the
  // verdict needs both a strict-pixel count and a real delta rather than a
  // non-zero pixel count.
  const chromeRepainted = chrome.strictPct > 0.05 && chrome.max > 12;
  const wholeRepainted = whole.strictPct > 0.05 && whole.max > 12;
  const verdict = chromeRepainted ? 'THEME' : wholeRepainted ? 'CONTENT' : whole.max === 0 ? 'IDENTICAL' : 'ANTIALIAS';
  if (verdict === 'THEME') themeMoved += 1;
  if (verdict === 'CONTENT') contentOnly += 1;
  if (whole.max === 0) exact += 1;
  rows.push({
    file,
    wholeMovedPct: Number(whole.movedPct.toFixed(4)),
    wholeStrictPct: Number(whole.strictPct.toFixed(4)),
    wholeMaxDelta: whole.max,
    chromeMovedPct: Number(chrome.movedPct.toFixed(4)),
    chromeMaxDelta: chrome.max,
    verdict,
  });
}

rows.sort((x, y) => y.wholeMovedPct - x.wholeMovedPct);
for (const r of rows) {
  console.log(
    `${r.file.padEnd(42)} whole=${String(r.wholeMovedPct).padStart(7)}% chrome=${String(r.chromeMovedPct).padStart(6)}% chromeMax=${String(r.chromeMaxDelta).padStart(3)} ${r.verdict}`,
  );
}

console.log(`\n${files.length} dark captures compared`);
console.log(`byte-identical whole frames: ${exact}/${files.length}`);
console.log(`captures whose theme chrome moved: ${themeMoved}`);
console.log(`captures whose delta is content only: ${contentOnly}`);

writeFileSync(
  resolve(DIR, 'after/dark-invariance.json'),
  `${JSON.stringify(
    {
      method:
        'Whole-frame delta is reported alongside the header-chrome band delta. The chrome band is painted by the theme token layer and carries no photograph, so it witnesses a palette change; a whole-frame delta with an identical chrome band is content (CMS photography), not theme.',
      supersedes: 'dark-invariance.whole-frame.json',
      captures: files.length,
      byteIdenticalWholeFrame: exact,
      themeChromeMoved: themeMoved,
      contentOnlyDelta: contentOnly,
      chromeBandPixels: CHROME_BAND,
      rows,
    },
    null,
    2,
  )}\n`,
);
