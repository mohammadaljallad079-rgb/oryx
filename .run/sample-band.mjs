/**
 * Samples the dominant text colours in a horizontal band of a screenshot.
 *
 * Usage: node .run/sample-band.mjs <png> <top> <height> [label]
 */
import sharp from 'sharp';

const [file, topArg, hArg, label] = process.argv.slice(2);
const top = +topArg;
const h = +hArg;

const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
const { width, channels: ch } = info;

const counts = new Map();
for (let y = top; y < top + h; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * ch;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Only sample pixels that are clearly not the dark scrim background.
    if (r + g + b < 180) continue;
    const key = `${r >> 3 << 3},${g >> 3 << 3},${b >> 3 << 3}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
}

const top10 = [...counts.entries()].sort((p, q) => q[1] - p[1]).slice(0, 10);
console.log(`${label || file}  band y ${top}..${top + h}`);
for (const [k, n] of top10) {
  const [r, g, b] = k.split(',').map(Number);
  const gold = r > 180 && g > 140 && b < 140 && r - b > 60 ? '  <-- GOLD' : '';
  console.log(`  rgb(${r},${g},${b})  x${n}${gold}`);
}
