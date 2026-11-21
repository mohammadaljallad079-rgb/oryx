// Locate the changed bands between the before/after dark homepage captures.
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const a = PNG.sync.read(readFileSync('docs/audit/exec07/phase-e-after/captures-before/homepage-dark-rtl-desktop.png'));
const b = PNG.sync.read(readFileSync('docs/audit/exec07/phase-e-after/captures/homepage-dark-rtl-desktop.png'));
console.log('dims', `${a.width}x${a.height}`, `${b.width}x${b.height}`);
if (a.width !== b.width || a.height !== b.height) process.exit(0);

const rows = [];
for (let y = 0; y < a.height; y++) {
  let changed = 0;
  for (let x = 0; x < a.width; x++) {
    const o = (y * a.width + x) * 4;
    const d = Math.max(
      Math.abs(a.data[o] - b.data[o]),
      Math.abs(a.data[o + 1] - b.data[o + 1]),
      Math.abs(a.data[o + 2] - b.data[o + 2]),
    );
    if (d > 8) changed++;
  }
  if (changed > a.width * 0.05) rows.push({ y, pct: +((changed / a.width) * 100).toFixed(1) });
}
console.log('rows >5% changed:', rows.length);
// Collapse into bands
let start = null;
let prev = null;
const bands = [];
for (const r of rows) {
  if (start === null) { start = r.y; prev = r.y; continue; }
  if (r.y - prev > 20) { bands.push([start, prev]); start = r.y; }
  prev = r.y;
}
if (start !== null) bands.push([start, prev]);
console.log('bands:', bands.map(([s, e]) => `${s}-${e}`).join(', '));
