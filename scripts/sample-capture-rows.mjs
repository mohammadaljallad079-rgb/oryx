/** Sample a capture's rows to see the vertical band structure. */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const file = process.argv[2];
const png = PNG.sync.read(readFileSync(file));
const { width, height, data } = png;
const rows = 12;
for (let r = 0; r < rows; r++) {
  const y = Math.floor((r + 0.5) * (height / rows));
  const counts = new Map();
  for (let x = 0; x < width; x += 3) {
    const i = (y * width + x) * 4;
    const k = '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const total = Math.ceil(width / 3);
  console.log(
    `y=${String(y).padStart(4)} ` + top.map(([k, c]) => `${k} ${((c / total) * 100).toFixed(0)}%`).join('  '),
  );
}
