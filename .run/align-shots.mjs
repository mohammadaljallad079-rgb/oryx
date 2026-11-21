/**
 * Finds the vertical offset that best aligns two renders. A near-zero residual
 * at a small offset means the pages differ by a layout shift (expected when the
 * hero eyebrow changes size); a large residual at every offset means a real
 * colour/imagery change.
 *
 * Usage: node .run/align-shots.mjs <a.png> <b.png> [maxShift]
 */
import sharp from 'sharp';

const [a, b, maxArg] = process.argv.slice(2);
const maxShift = parseInt(maxArg || '12', 10);

const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
const B = await sharp(b).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels: ch } = A.info;

const at = (buf, x, y) => {
  const i = (y * width + x) * ch;
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2]];
};

let best = { shift: 0, diff: Infinity };
for (let s = 0; s <= maxShift; s += 1) {
  let d = 0;
  let n = 0;
  for (let y = 0; y + s < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const p = at(A, x, y);
      const q = at(B, x, y + s);
      d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
      n += 3;
    }
  }
  const mean = d / n;
  console.log(`  shift ${String(s).padStart(2)}px -> mean channel delta ${mean.toFixed(3)}`);
  if (mean < best.diff) best = { shift: s, diff: mean };
}
console.log(`best alignment: ${best.shift}px shift, mean channel delta ${best.diff.toFixed(3)}`);
