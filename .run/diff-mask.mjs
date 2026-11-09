/**
 * Writes a visual diff mask (changed pixels in magenta over a dimmed base) and
 * a per-band histogram, so a large diff can be attributed to a region.
 *
 * Usage: node .run/diff-mask.mjs <a.png> <b.png> <out.png>
 */
import sharp from 'sharp';

const [a, b, out] = process.argv.slice(2);
const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
const B = await sharp(b).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels: ch } = A.info;

const mask = Buffer.alloc(width * height * 3);
const bands = new Array(Math.ceil(height / 64)).fill(0);

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * ch;
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]),
    );
    const o = (y * width + x) * 3;
    if (d > 6) {
      mask[o] = 255;
      mask[o + 1] = 0;
      mask[o + 2] = 255;
      bands[Math.floor(y / 64)] += 1;
    } else {
      const v = Math.round((A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3 / 3);
      mask[o] = v;
      mask[o + 1] = v;
      mask[o + 2] = v;
    }
  }
}

await sharp(mask, { raw: { width, height, channels: 3 } }).png().toFile(out);
console.log(`wrote ${out}`);
bands.forEach((n, i) => {
  if (n > 0) console.log(`  y ${i * 64}..${i * 64 + 63}: ${n}`);
});
