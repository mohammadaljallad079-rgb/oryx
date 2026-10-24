/**
 * Builds the Phase E light-vs-dark comparison sheets.
 *
 * The owner asked for a light/dark comparison, so each of the five required
 * customer surfaces gets one side-by-side sheet per locale: light on the left,
 * dark on the right, at the same viewport. That makes "the light theme is now
 * professional and the approved dark theme is untouched" visible in one image.
 *
 * Run with: node .run/make-light-dark-pairs.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PHASE = process.argv[2] === 'before' ? 'before' : 'after';
const DIR = resolve(`docs/audit/exec07/phase-e/${PHASE}`);
const OUT = resolve(`docs/audit/exec07/phase-e/comparisons-${PHASE}`);
mkdirSync(OUT, { recursive: true });

const SURFACES = [
  ['01-homepage', '/'],
  ['02-dashboard', '/dashboard'],
  ['03-providers', '/providers'],
  ['04-login', '/login'],
  ['06-profile', '/profile'],
];
const LOCALES = ['en', 'ar'];
const VIEWPORTS = ['desktop', 'tablet', 'mobile'];

/** Label bar drawn above each panel so the theme is readable at a glance. */
function label(text, width) {
  const svg = `<svg width="${width}" height="34" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="34" fill="#1b1b1b"/>
    <text x="12" y="23" font-family="monospace" font-size="16" fill="#f5f0e6">${text}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

for (const [name, route] of SURFACES) {
  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      const lightPath = resolve(DIR, `${name}-${viewport}-${locale}-light.png`);
      const darkPath = resolve(DIR, `${name}-${viewport}-${locale}-dark.png`);
      const light = sharp(lightPath);
      const dark = sharp(darkPath);
      const { width: lw, height: lh } = await light.metadata();
      const { width: dw, height: dh } = await dark.metadata();
      const gap = 24;
      const totalW = lw + gap + dw;
      const totalH = Math.max(lh, dh) + 34;

      const lightLabel = await label(`LIGHT  ${route}  ${locale}  ${viewport}`, lw);
      const darkLabel = await label(`DARK  ${route}  ${locale}  ${viewport}`, dw);

      await sharp({
        create: {
          width: totalW,
          height: totalH,
          channels: 3,
          background: { r: 27, g: 27, b: 27 },
        },
      })
        .composite([
          { input: lightLabel, top: 0, left: 0 },
          { input: darkLabel, top: 0, left: lw + gap },
          { input: await light.png().toBuffer(), top: 34, left: 0 },
          { input: await dark.png().toBuffer(), top: 34, left: lw + gap },
        ])
        .jpeg({ quality: 88 })
        .toFile(resolve(OUT, `${name}-${viewport}-${locale}-light-vs-dark.jpg`));
      console.log(`  ${name}-${viewport}-${locale}-light-vs-dark.jpg`);
    }
  }
}

console.log(`\n-> ${OUT}`);
