/**
 * Measures the rendered height of the homepage hero title in a screenshot by
 * finding the vertical span of near-white text pixels inside the title band.
 * Distinguishes the 38px and 46px hero title variants.
 *
 * Usage: node .run/measure-title.mjs <png> [label]
 */
import sharp from 'sharp';

const [file, label] = process.argv.slice(2);
const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels: ch } = info;

// Title ink is near-white; the lede is dimmer, the eyebrow is gold.
const bright = (i) => data[i] + data[i + 1] + data[i + 2] > 650;

let first = -1;
let last = -1;
for (let y = 120; y < 340 && y < height; y += 1) {
  let n = 0;
  for (let x = 600; x < Math.min(1340, width); x += 1) {
    if (bright((y * width + x) * ch)) n += 1;
  }
  if (n >= 4) {
    if (first < 0) first = y;
    last = y;
  }
}

console.log(
  `${(label || file).padEnd(34)} title rows ${first}..${last}  height ${last - first + 1}px`,
);
