/**
 * Confirm the captured pixels carry the palette the design calls for: the light
 * captures should be dominated by an ivory field with warm neutral surfaces,
 * and the dark captures by navy. Counting families of pixels is a check the eye
 * cannot do consistently across 60 images.
 */
import sharp from 'sharp';
import { resolve } from 'node:path';

const D = 'docs/audit/exec07/phase-e/after';
const files = [
  ['light homepage', '01-homepage-desktop-en-light.png'],
  ['dark  homepage', '01-homepage-desktop-en-dark.png'],
  ['light dashboard', '02-dashboard-desktop-en-light.png'],
  ['light providers', '03-providers-desktop-en-light.png'],
  ['light login', '04-login-desktop-en-light.png'],
  ['light profile', '06-profile-desktop-en-light.png'],
];

for (const [label, f] of files) {
  const { data, info } = await sharp(resolve(D, f)).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let ivory = 0;
  let white = 0;
  let navy = 0;
  let gold = 0;
  let ink = 0;
  let total = 0;
  const hist = new Map();
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    total += 1;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    hist.set(key, (hist.get(key) ?? 0) + 1);
    if (r > 235 && g > 228 && b > 215 && r >= g && g >= b) ivory += 1;
    if (r > 248 && g > 248 && b > 248) white += 1;
    if (r < 40 && g < 60 && b > 20 && b < 90 && b > r) navy += 1;
    if (r > 150 && g > 110 && g < 210 && b < 110 && r > b + 60) gold += 1;
    if (r < 60 && g < 60 && b < 60) ink += 1;
  }
  const pct = (n) => ((n / total) * 100).toFixed(2);
  console.log(
    `${label.padEnd(16)} ivory=${pct(ivory)}% white=${pct(white)}% navy=${pct(navy)}% gold=${pct(gold)}% darkink=${pct(ink)}%`,
  );
  const top = [...hist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `(${k})=${((v / total) * 100).toFixed(1)}%`)
    .join(' ');
  console.log(`   top buckets: ${top}`);
}
