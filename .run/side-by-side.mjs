/**
 * Crops the same region out of two renders and writes a side-by-side strip so a
 * large diff can be attributed by eye.
 *
 * Usage: node .run/side-by-side.mjs <a.png> <b.png> <out.png> <left> <top> <w> <h>
 */
import sharp from 'sharp';

const [a, b, out, left, top, w, h] = process.argv.slice(2);
const region = { left: +left, top: +top, width: +w, height: +h };

const A = await sharp(a).extract(region).toBuffer();
const B = await sharp(b).extract(region).toBuffer();

await sharp({
  create: {
    width: region.width * 2 + 12,
    height: region.height,
    channels: 3,
    background: { r: 255, g: 0, b: 255 },
  },
})
  .composite([
    { input: A, left: 0, top: 0 },
    { input: B, left: region.width + 12, top: 0 },
  ])
  .png()
  .toFile(out);

console.log(`wrote ${out} (left=${a}, right=${b})`);
