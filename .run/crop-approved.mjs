/**
 * Crops the approved homepage reference into regions so the intended treatment
 * of the hero eyebrow, title and lede can be read off the owner's artwork
 * instead of guessed.
 */
import sharp from 'sharp';

const SRC = 'docs/assets/ORYX Arabic Auto Services Homepage.png';

const regions = [
  ['hero-top', 0, 700, 1024, 260],
  ['hero-mid', 0, 940, 1024, 260],
  ['nav', 0, 0, 1024, 220],
];

for (const [name, left, top, width, height] of regions) {
  await sharp(SRC)
    .extract({ left, top, width, height })
    .resize({ width: 900 })
    .toFile(`/tmp/ref-${name}.png`);
  console.log(`wrote /tmp/ref-${name}.png`);
}
