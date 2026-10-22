// Characterise the one capture that differed between two identical runs.
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';

const f = 'docs/audit/exec07/phase-e-after/captures/homepage-light-rtl-mobile.png';
const a = PNG.sync.read(execSync(`git show HEAD:${f}`, { maxBuffer: 1 << 28 }));
const b = PNG.sync.read(execSync(`cat ${f}`, { maxBuffer: 1 << 28 }));
console.log('dims', `${a.width}x${a.height}`, '->', `${b.width}x${b.height}`);
if (a.width !== b.width || a.height !== b.height) process.exit(0);

let max = 0;
let changed = 0;
let minX = 1e9;
let maxX = -1;
let minY = 1e9;
let maxY = -1;
for (let y = 0; y < a.height; y++) {
  for (let x = 0; x < a.width; x++) {
    const o = (y * a.width + x) * 4;
    const d = Math.max(
      Math.abs(a.data[o] - b.data[o]),
      Math.abs(a.data[o + 1] - b.data[o + 1]),
      Math.abs(a.data[o + 2] - b.data[o + 2]),
    );
    if (d > 2) {
      changed++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (d > max) max = d;
  }
}
const px = a.width * a.height;
console.log(`maxDelta=${max} changed=${((changed / px) * 100).toFixed(4)}%`);
console.log(`bbox x=${minX}-${maxX} y=${minY}-${maxY} (page height ${a.height})`);
console.log(`bbox is in the bottom ${(((a.height - minY) / a.height) * 100).toFixed(1)}% of the page`);
