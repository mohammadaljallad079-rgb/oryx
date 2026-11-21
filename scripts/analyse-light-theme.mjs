/**
 * Analyse the light-theme captures for palette consistency.
 *
 * Rather than eyeballing screenshots, this extracts the actual pixel palette of
 * each surface and reports:
 *
 *   - the dominant background colours (is the ivory field consistent?)
 *   - how many distinct near-white/ivory surfaces appear (a sign of ad-hoc
 *     surfaces rather than one token ramp)
 *   - the warm-gold pixels actually rendered (is the accent one gold?)
 *
 * A consistent light theme shows a small, clustered palette; an inconsistent one
 * shows many near-duplicate off-whites and several different golds.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const DIR = process.env.ORYX_OUT ?? '/tmp/oryx-light/captures';

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function analyse(file) {
  const png = PNG.sync.read(readFileSync(file));
  const { width, height, data } = png;
  const counts = new Map();
  // Sample a grid rather than every pixel: enough for a palette, fast.
  const stepX = Math.max(1, Math.floor(width / 300));
  const stepY = Math.max(1, Math.floor(height / 300));
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (width * y + x) << 2;
      const a = data[i + 3];
      if (a < 250) continue; // ignore translucent overlays
      // Quantise to 8 levels per channel so near-identical shades collapse.
      const r = data[i] & 0xf8;
      const g = data[i + 1] & 0xf8;
      const b = data[i + 2] & 0xf8;
      const k = (r << 16) | (g << 8) | b;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((s, v) => s + v, 0);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, n]) => ({
      color: hex((k >> 16) & 0xff, (k >> 8) & 0xff, k & 0xff),
      pct: Number(((n / total) * 100).toFixed(2)),
    }));
  return { file: file.split('/').pop(), top };
}

/** Warm, light, low-saturation colours — the ivory/neutral surface family. */
function isIvorySurface(c) {
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max > 224 && max - min < 40;
}

/** Gold-ish: red>green>blue with a clear warm gap and mid luminance. */
function isGold(c) {
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return r > 120 && r > g && g > b && r - b > 45;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
const rows = files.map((f) => analyse(join(DIR, f)));

console.log('surface                                   dominant palette (top 5)');
console.log('-'.repeat(110));
const ivorySets = [];
const goldSets = [];
for (const row of rows) {
  const palette = row.top.map((t) => `${t.color} ${t.pct}%`).join('  ');
  console.log(`${row.file.padEnd(42)}${palette}`);
  ivorySets.push(...row.top.filter((t) => isIvorySurface(t.color)).map((t) => t.color));
  goldSets.push(...row.top.filter((t) => isGold(t.color)).map((t) => t.color));
}

const uniq = (a) => [...new Set(a)].sort();
console.log(`\nDistinct ivory/neutral surfaces across all captures (${ivorySets.length} samples):`);
console.log('  ' + uniq(ivorySets).join('  '));
console.log(`\nDistinct gold accents rendered (${goldSets.length} samples):`);
console.log('  ' + uniq(goldSets).join('  '));
