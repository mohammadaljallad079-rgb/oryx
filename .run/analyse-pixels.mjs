/**
 * Reports the actual colours the light theme renders, grouped, so a muddy or
 * inconsistent accent is visible as data rather than by eye.
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
for (const f of files) {
  const png = PNG.sync.read(readFileSync(f));
  const counts = new Map();
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    // Quantise to 8-level buckets so near-identical colours group.
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = png.width * png.height;
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  console.log(`\n${f}  ${png.width}x${png.height}`);
  for (const [key, n] of top) {
    const [r, g, b] = key.split(',').map((v) => Number(v) * 32 + 16);
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    console.log(`  ${hex}  ${((n / total) * 100).toFixed(2)}%  rgb(${r}, ${g}, ${b})`);
  }
  // Saturated gold-ish pixels: hue in the 35-60 degree band, decent saturation.
  let gold = 0;
  const goldSamples = new Map();
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 40 || r < 120) continue;
    // r > g > b with a wide spread is the gold family.
    if (!(r > g && g > b)) continue;
    gold += 1;
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    goldSamples.set(key, (goldSamples.get(key) ?? 0) + 1);
  }
  console.log(`  gold-family pixels: ${((gold / total) * 100).toFixed(2)}%`);
  for (const [key, n] of [...goldSamples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    const [r, g, b] = key.split(',').map((v) => Number(v) * 32 + 16);
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    console.log(`     ${hex}  ${((n / total) * 100).toFixed(3)}%`);
  }
}
