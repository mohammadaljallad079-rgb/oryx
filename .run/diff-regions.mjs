/**
 * Reports where two renders differ: bounding box, per-row band histogram and
 * the most common before/after colour pair. Use it to attribute a pixel diff to
 * a specific element instead of guessing.
 *
 * Usage: node .run/diff-regions.mjs <a.png> <b.png>
 */
import sharp from 'sharp';

const [a, b] = process.argv.slice(2);
const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
const B = await sharp(b).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels: ch } = A.info;

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
const rows = new Map();
const pairs = new Map();

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * ch;
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]),
    );
    if (d === 0) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    rows.set(y, (rows.get(y) || 0) + 1);
    const key = `${A.data[i]},${A.data[i + 1]},${A.data[i + 2]} -> ${B.data[i]},${B.data[i + 1]},${B.data[i + 2]}`;
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }
}

console.log(`${a} vs ${b}`);
if (maxX < 0) {
  console.log('  identical');
  process.exit(0);
}
console.log(`  bbox: x ${minX}..${maxX}, y ${minY}..${maxY}`);
const bands = [...rows.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8);
console.log('  worst rows (y: differing px):');
for (const [y, n] of bands) console.log(`    y=${y}: ${n}`);
console.log('  top colour pairs:');
for (const [k, n] of [...pairs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 6)) {
  console.log(`    ${k}  x${n}`);
}
