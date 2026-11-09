/**
 * Report where two captures differ by MORE than a small delta, so a broad
 * antialiasing shift can be told apart from a real element change.
 *
 * Usage: node .run/diff-high.mjs <a.png> <b.png> [threshold]
 */
import sharp from 'sharp';

const [a, b, t = '12'] = process.argv.slice(2);
const THRESHOLD = Number(t);
const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
const B = await sharp(b).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels: ch } = A.info;

const rows = new Map();
const pairs = new Map();
let n = 0;
let minX = width;
let maxX = -1;
let minY = height;
let maxY = -1;
const deltaHist = new Map();

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * ch;
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]),
    );
    if (d <= THRESHOLD) continue;
    n += 1;
    rows.set(y, (rows.get(y) ?? 0) + 1);
    const bucket = Math.floor(d / 32) * 32;
    deltaHist.set(bucket, (deltaHist.get(bucket) ?? 0) + 1);
    const key = `${A.data[i]},${A.data[i + 1]},${A.data[i + 2]} -> ${B.data[i]},${B.data[i + 1]},${B.data[i + 2]}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

console.log(`${a.split('/').pop()}`);
console.log(`pixels with delta > ${THRESHOLD}: ${n} (${((n / (width * height)) * 100).toFixed(3)}%)`);
console.log(`bbox: x ${minX}..${maxX}  y ${minY}..${maxY}`);
console.log('\ndelta histogram:');
for (const [k, v] of [...deltaHist.entries()].sort((x, y) => x[0] - y[0])) {
  console.log(`  delta ${k}-${k + 31}: ${v}`);
}
console.log('\ntop colour pairs:');
for (const [k, v] of [...pairs.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)) {
  console.log(`  x${String(v).padStart(6)}  ${k}`);
}
console.log('\nrows with most differences:');
for (const [y, v] of [...rows.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12)) {
  console.log(`  y=${y}: ${v}`);
}
