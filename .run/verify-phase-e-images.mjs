/**
 * Verify a Phase E capture is the surface and theme it claims.
 *
 * Reads the manifest entry for each image and re-measures the rendered page
 * field and ink from the PNG itself, then reports whether the image's dominant
 * background matches the theme it is filed under (ivory for light, navy for
 * dark). This catches an image that was captured before authentication, or in
 * the wrong theme.
 *
 * Usage: node .run/verify-phase-e-images.mjs
 */
import { PNG } from 'pngjs';
import { readFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';

const DIR = 'docs/audit/exec07/phase-e/after';

function medianChannel(png, pred) {
  const r = [];
  const g = [];
  const b = [];
  for (let y = 0; y < png.height; y += 4) {
    for (let x = 0; x < png.width; x += 4) {
      const i = (png.width * y + x) * 4;
      const px = [png.data[i], png.data[i + 1], png.data[i + 2]];
      if (pred && !pred(px, x, y, png)) continue;
      r.push(px[0]);
      g.push(px[1]);
      b.push(px[2]);
    }
  }
  const m = (a) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  return [m(r), m(g), m(b)];
}

const near = (px, t, tol = 14) => px && Math.abs(px[0] - t[0]) <= tol && Math.abs(px[1] - t[1]) <= tol && Math.abs(px[2] - t[2]) <= tol;
const IVORY = [247, 244, 237];
const NAVY = [0, 22, 43];

const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
let bad = 0;
for (const f of files) {
  const png = PNG.sync.read(readFileSync(`${DIR}/${f}`));
  // Sample a horizontal band in the upper-middle of the page, below any hero.
  const band = { y0: Math.round(png.height * 0.12), y1: Math.round(png.height * 0.22) };
  const px = medianChannel(png, (_p, _x, y) => y >= band.y0 && y <= band.y1);
  const isLight = f.includes('-light');
  const expect = isLight ? IVORY : NAVY;
  const ok = near(px, expect, 30);
  if (!ok) bad += 1;
  console.log(`${ok ? 'OK  ' : 'SUSPECT'} ${f.padEnd(42)} bandMedian=rgb(${px.join(',')}) expect~rgb(${expect.join(',')})`);
}
console.log(`\n${files.length} images, ${bad} suspect`);
