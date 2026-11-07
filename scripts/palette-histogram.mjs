/**
 * Palette histogram of the captured light-theme screenshots.
 *
 * "The light theme colours look inconsistent" is a claim that some surfaces use
 * a colour that does not belong to the approved warm ivory identity. This reads
 * each screenshot, quantises the pixels, and reports the dominant colours with
 * their warmth (hue) and saturation, so a cold blue-grey or a stray saturated
 * block stands out as a number.
 *
 * Usage: node scripts/palette-histogram.mjs <png> [<png> ...]
 */

import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

function quantise(r, g, b, step = 16) {
  return [Math.round(r / step) * step, Math.round(g / step) * step, Math.round(b / step) * step];
}

function describe(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  // Warm when red >= blue; cold when blue dominates.
  const warmth = r - b;
  return { sat, warmth };
}

for (const file of process.argv.slice(2)) {
  const png = PNG.sync.read(readFileSync(file));
  const counts = new Map();
  let total = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 128) continue;
    const key = quantise(png.data[i], png.data[i + 1], png.data[i + 2]).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`\n=== ${file}  (${total} px) ===`);
  for (const [key, n] of top) {
    const [r, g, b] = key.split(',').map(Number);
    const { sat, warmth } = describe(r, g, b);
    const tag = warmth >= 4 ? 'warm' : warmth <= -4 ? 'COLD' : 'neutral';
    const pct = ((n / total) * 100).toFixed(1);
    console.log(
      `  #${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}  ` +
        `${pct.padStart(5)}%  sat ${sat.toFixed(2)}  warmth ${String(warmth).padStart(4)}  ${tag}`,
    );
  }

  // Any colour that is both cold and saturated is off-identity on an ivory page.
  const coldSaturated = [...counts.entries()]
    .map(([key, n]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { key, n, ...describe(r, g, b) };
    })
    .filter((c) => c.warmth < -10 && c.sat > 0.25 && c.n / total > 0.002)
    .sort((a, b) => b.n - a.n);
  if (coldSaturated.length) {
    console.log('  -- cold+saturated outliers (off-identity on ivory) --');
    for (const c of coldSaturated.slice(0, 6)) {
      console.log(
        `     #${c.key.split(',').map((v) => Number(v).toString(16).padStart(2, '0')).join('')}  ` +
          `${((c.n / total) * 100).toFixed(2)}%  warmth ${c.warmth}  sat ${c.sat.toFixed(2)}`,
      );
    }
  }
}
