/**
 * Characterise the dark-theme delta between two capture sets.
 *
 * "Keep the approved dark theme intact" is only meaningful if we can say *what*
 * moved. This reports, per dark capture, the changed-pixel share, the largest
 * channel delta, and the dominant before/after colours of the changed pixels, so
 * an intended token tweak (faint text) can be told apart from a real colour
 * shift in the status ramp or a surface.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const BEFORE = process.env.ORYX_BEFORE;
const AFTER = process.env.ORYX_AFTER;

const key = (d, i) => `${d[i]},${d[i + 1]},${d[i + 2]}`;
const hex = (s) => {
  const [r, g, b] = s.split(',').map(Number);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
};

const files = readdirSync(BEFORE).filter((f) => f.includes('-dark') && f.endsWith('.png')).sort();
console.log(`${'capture'.padEnd(42)}${'changed'.padStart(9)}${'maxD'.padStart(6)}  dominant moved colours`);
for (const f of files) {
  const b = join(AFTER, f);
  if (!existsSync(b)) continue;
  const p1 = PNG.sync.read(readFileSync(join(BEFORE, f)));
  const p2 = PNG.sync.read(readFileSync(b));
  const { width, height, data: d1 } = p1;
  const d2 = p2.data;
  let moved = 0;
  let maxD = 0;
  const before = new Map();
  const after = new Map();
  for (let i = 0; i < d1.length; i += 4) {
    const delta = Math.max(
      Math.abs(d1[i] - d2[i]),
      Math.abs(d1[i + 1] - d2[i + 1]),
      Math.abs(d1[i + 2] - d2[i + 2]),
    );
    if (delta > maxD) maxD = delta;
    if (delta > 2) {
      moved += 1;
      const kb = key(d1, i);
      const ka = key(d2, i);
      before.set(kb, (before.get(kb) ?? 0) + 1);
      after.set(ka, (after.get(ka) ?? 0) + 1);
    }
  }
  const top = (m) =>
    [...m.entries()]
      .sort((a, b2) => b2[1] - a[1])
      .slice(0, 2)
      .map(([k, c]) => `${hex(k)}x${c}`)
      .join(' ');
  const share = ((moved / (width * height)) * 100).toFixed(3);
  console.log(`${f.padEnd(42)}${(share + '%').padStart(9)}${String(maxD).padStart(6)}  ${top(before)}  ->  ${top(after)}`);
}
