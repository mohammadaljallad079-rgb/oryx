/**
 * Lists the N largest pixel deltas with coordinates and both colours, plus a
 * 10x10 grid summary of where large deltas cluster. Use it to name the element
 * behind a diff.
 *
 * Usage: node .run/diff-top.mjs <a.png> <b.png> [n]
 */
import sharp from 'sharp';

const [a, b, nArg] = process.argv.slice(2);
const N = parseInt(nArg || '25', 10);

const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
const B = await sharp(b).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels: ch } = A.info;

const hits = [];
const grid = Array.from({ length: 10 }, () => new Array(10).fill(0));

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * ch;
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]),
    );
    if (d > 20) {
      grid[Math.min(9, Math.floor((y / height) * 10))][Math.min(9, Math.floor((x / width) * 10))] += 1;
      if (hits.length < 40000) {
        hits.push({
          d,
          x,
          y,
          from: `${A.data[i]},${A.data[i + 1]},${A.data[i + 2]}`,
          to: `${B.data[i]},${B.data[i + 1]},${B.data[i + 2]}`,
        });
      }
    }
  }
}

hits.sort((p, q) => q.d - p.d);
console.log('top deltas:');
for (const h of hits.slice(0, N)) {
  console.log(`  (${h.x},${h.y}) d=${h.d}  ${h.from} -> ${h.to}`);
}

console.log('\ngrid (rows = y decile, cols = x decile), count of delta>20:');
for (const row of grid) console.log('  ' + row.map((v) => String(v).padStart(6)).join(''));
