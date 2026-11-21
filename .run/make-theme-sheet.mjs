/**
 * Builds the light-vs-dark comparison sheet the owner asked for, from the
 * published preview captures, so the two themes are read side by side at the
 * same viewport and locale.
 *
 * Usage: node .run/make-theme-sheet.mjs <light.png> <dark.png> <out.png>
 */
import sharp from 'sharp';

const [lightPath, darkPath, outPath] = process.argv.slice(2);
if (!lightPath || !darkPath || !outPath) {
  console.error('usage: node .run/make-theme-sheet.mjs <light.png> <dark.png> <out.png>');
  process.exit(1);
}

const W = 760;
const GAP = 24;
const PAD = 28;
const HEAD = 44;

const light = await sharp(lightPath).resize({ width: W }).toBuffer({ resolveWithObject: true });
const dark = await sharp(darkPath).resize({ width: W }).toBuffer({ resolveWithObject: true });
const h = Math.max(light.info.height, dark.info.height);

const label = (text) =>
  Buffer.from(
    `<svg width="${W}" height="${HEAD}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${W}" height="${HEAD}" fill="#0b1a2b"/>` +
      `<text x="${W / 2}" y="29" font-family="Helvetica,Arial" font-size="17" font-weight="700" ` +
      `fill="#e8c766" text-anchor="middle">${text}</text></svg>`,
  );

const canvasW = PAD * 2 + W * 2 + GAP;
const canvasH = PAD * 2 + HEAD + h + 26;

await sharp({
  create: { width: canvasW, height: canvasH, channels: 3, background: '#f4f0e8' },
})
  .composite([
    { input: await label('LIGHT THEME'), left: PAD, top: PAD },
    { input: light.data, left: PAD, top: PAD + HEAD },
    { input: await label('DARK THEME'), left: PAD + W + GAP, top: PAD },
    { input: dark.data, left: PAD + W + GAP, top: PAD + HEAD },
  ])
  .png()
  .toFile(outPath);

console.log(`wrote ${outPath} (${canvasW}x${canvasH})`);
