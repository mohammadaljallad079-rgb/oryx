/** Verify the Exec-11 light captures really are the ivory light theme. */
import { PNG } from 'pngjs';
import { readFileSync, readdirSync } from 'fs';

const DIR = 'docs/audit/exec11/light-theme';
const IVORY = [247, 244, 237];
const NAVY = [0, 22, 43];

function topColours(file) {
  const png = PNG.sync.read(readFileSync(`${DIR}/${file}`));
  const counts = new Map();
  // Sample only the top 260 CSS px (the page field under the header) so a tall
  // dark footer band cannot dominate a full-page capture and read as "dark".
  const rows = Math.min(260, png.height);
  for (let y = 0; y < rows; y += 3) {
    for (let x = 0; x < png.width; x += 7) {
      const i = (png.width * y + x) << 2;
      const key = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
}

function near(rgb, target, tol = 12) {
  return rgb.every((v, i) => Math.abs(v - target[i]) <= tol);
}

let bad = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.png')).sort()) {
  const top = topColours(file);
  const dominant = top[0][0].split(',').map(Number);
  const light = near(dominant, IVORY, 20);
  const dark = near(dominant, NAVY, 24);
  const isLightFile = file.includes('-light');
  const ok = isLightFile ? light : dark;
  if (!ok) bad += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${file.padEnd(46)} dominant=rgb(${dominant.join(',')}) ${isLightFile ? 'light' : 'dark'}`,
  );
}
console.log(bad === 0 ? '\nAll captures match their declared theme.' : `\n${bad} capture(s) mismatch.`);
process.exit(bad === 0 ? 0 : 1);
