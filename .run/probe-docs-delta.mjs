// Quantify how far the committed dark screenshots moved after the recovered
// token change, to decide whether the approved dark theme was disturbed.
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';

const files = execSync('git diff --name-only -- docs/', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('.png'));

let worst = 0;
for (const f of files) {
  const oldBuf = execSync(`git show HEAD:${f}`, { maxBuffer: 1 << 28 });
  const a = PNG.sync.read(oldBuf);
  const b = PNG.sync.read(execSync(`cat ${f}`, { maxBuffer: 1 << 28 }));
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`${f}: SIZE ${a.width}x${a.height} -> ${b.width}x${b.height}`);
    continue;
  }
  let max = 0;
  let changed = 0;
  const px = a.width * a.height;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const d = Math.max(
      Math.abs(a.data[o] - b.data[o]),
      Math.abs(a.data[o + 1] - b.data[o + 1]),
      Math.abs(a.data[o + 2] - b.data[o + 2]),
    );
    if (d > 2) changed++;
    if (d > max) max = d;
  }
  const pct = ((changed / px) * 100).toFixed(3);
  worst = Math.max(worst, max);
  console.log(`${f}: maxDelta=${max} changed=${pct}%`);
}
console.log('worst maxDelta across all:', worst);
