import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [a, b, xs, ys, xe, ye] = process.argv.slice(2);
const [x0, y0, x1, y1] = [xs, ys, xe, ye].map(Number);
const A = PNG.sync.read(readFileSync(a));
const B = PNG.sync.read(readFileSync(b));
const hex = (p, i) => '#' + [p.data[i], p.data[i + 1], p.data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
for (let y = y0; y <= y1; y += 3) {
  let row = '';
  for (let x = x0; x <= x1; x += 4) {
    const i = (y * A.width + x) * 4;
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]),
    );
    row += d > 2 ? 'X' : '.';
  }
  console.log(String(y).padStart(5), row, ' A=' + hex(A, (y * A.width + x0) * 4), 'B=' + hex(B, (y * B.width + x0) * 4));
}
