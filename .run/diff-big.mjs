/**
 * Bounding box and region breakdown of only the *large* pixel deltas, so a real
 * colour change can be separated from antialiasing noise.
 *
 * Usage: node .run/diff-big.mjs <a.png> <b.png> [threshold]
 */
import sharp from 'sharp';

const [a, b, thrArg] = process.argv.slice(2);
const thr = parseInt(thrArg || '20', 10);

const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
const B = await sharp(b).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels: ch } = A.info;

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
let count = 0;
const rows = new Map();

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * ch;
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]),
    );
    if (d <= thr) continue;
    count += 1;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    rows.set(y, (rows.get(y) || 0) + 1);
  }
}

console.log(`${a} vs ${b}  (delta > ${thr})`);
console.log(`  large-delta pixels: ${count} (${((count / (width * height)) * 100).toFixed(2)}%)`);
if (count) {
  console.log(`  bbox: x ${minX}..${maxX}, y ${minY}..${maxY}`);
  const sorted = [...rows.keys()].sort((p, q) => p - q);
  const gaps = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const y of sorted.slice(1)) {
    if (y - prev > 20) {
      gaps.push([start, prev]);
      start = y;
    }
    prev = y;
  }
  gaps.push([start, prev]);
  console.log('  contiguous y-ranges:');
  for (const [s, e] of gaps) console.log(`    y ${s}..${e}`);
}
