/**
 * Builds the review pack for the ORYX Marketplace demo.
 *
 * Three artefacts, all from the raw captures:
 *
 *   - `pairs/`       a light/dark side-by-side per screen, so a theme change is
 *                    reviewed as a difference rather than from memory.
 *   - `sheet-*.png`  contact sheets of the whole app, one per theme.
 *   - `index.html`   a browsable gallery, served by the preview proxy at
 *                    /evidence/exec07-phase-e/marketplace/.
 *
 * The captures are 2x, so every tile is downscaled: the review is about palette
 * and layout, and full-resolution tiles make the sheets unreadable.
 *
 * Run: node .run/make-marketplace-sheets.mjs
 */
import sharp from 'sharp';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const DIR = '.run/evidence/exec07-phase-e/marketplace';
const PAIRS = `${DIR}/pairs`;

/** The screens a reviewer should see first, in order. */
const SCREENS = [
  ['00-onboarding', 'Onboarding'],
  ['01-login', 'Sign in'],
  ['02-home', 'Marketplace home'],
  ['03-parts', 'Parts'],
  ['09b-part-detail', 'Part detail'],
  ['04-services', 'Services'],
  ['09c-provider-detail', 'Provider detail'],
  ['05-sensage', 'SENSAGE'],
  ['06-recovery', 'Recovery'],
  ['07-orders', 'Orders'],
  ['08-bookings', 'Bookings'],
  ['09-vehicle-add', 'Add vehicle'],
  ['10-cart', 'Cart'],
  ['11-checkout', 'Checkout'],
  ['12-wallet', 'Wallet'],
  ['13-favourites', 'Favourites'],
  ['14-notifications', 'Notifications'],
  ['15-support', 'Support'],
  ['16-account', 'Account'],
];

const TILE_W = 380;
const TILE_H = 844;

/** The Arabic pass, captured through the app's own locale control. */
const ARABIC = [
  ['ar-02-home', 'Home'],
  ['ar-03-parts', 'Parts'],
  ['ar-04-services', 'Services'],
  ['ar-07-orders', 'Orders'],
  ['ar-16-account', 'Account'],
];

mkdirSync(PAIRS, { recursive: true });

/** Downscales one capture to the tile size. */
async function tile(path) {
  return sharp(path).resize({ width: TILE_W, height: TILE_H, fit: 'cover' }).toBuffer();
}

/** Writes a light|dark pair with a gutter, plus a caption bar. */
async function pair(name, label) {
  const dark = `${DIR}/${name}-dark.png`;
  const light = `${DIR}/${name}-light.png`;
  let buffers;
  try {
    buffers = [await tile(light), await tile(dark)];
  } catch {
    return null;
  }
  const GAP = 10;
  const out = `${PAIRS}/${name}.png`;
  await sharp({
    create: {
      width: TILE_W * 2 + GAP,
      height: TILE_H,
      channels: 3,
      background: { r: 24, g: 24, b: 28 },
    },
  })
    .composite([
      { input: buffers[0], top: 0, left: 0 },
      { input: buffers[1], top: 0, left: TILE_W + GAP },
    ])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  pair  ${label.padEnd(20)} ${out}`);
  return out;
}

/** Tiles a column of screens into one contact sheet for a theme. */
async function sheet(theme) {
  const COLS = 5;
  const GAP = 8;
  const cells = [];
  for (const [name] of SCREENS) {
    const p = `${DIR}/${name}-${theme}.png`;
    try {
      cells.push(await tile(p));
    } catch {
      /* a screen without a capture for this theme is skipped */
    }
  }
  if (!cells.length) return null;
  const rows = Math.ceil(cells.length / COLS);
  const out = `${DIR}/sheet-${theme}.png`;
  await sharp({
    create: {
      width: COLS * TILE_W + (COLS - 1) * GAP,
      height: rows * TILE_H + (rows - 1) * GAP,
      channels: 3,
      background: { r: 24, g: 24, b: 28 },
    },
  })
    .composite(
      cells.map((input, i) => ({
        input,
        top: Math.floor(i / COLS) * (TILE_H + GAP),
        left: (i % COLS) * (TILE_W + GAP),
      })),
    )
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  sheet ${theme.padEnd(19)} ${out} (${cells.length} tiles)`);
  return out;
}

for (const [name, label] of SCREENS) await pair(name, label);
await sheet('light');
await sheet('dark');
for (const [name, label] of ARABIC) await pair(name, `AR ${label}`);

/* --------------------------------------------------------------- gallery */

const rows = SCREENS.filter(([n]) =>
  readdirSync(PAIRS).includes(`${n}.png`),
)
  .map(
    ([name, label]) => `      <figure>
        <img src="pairs/${name}.png" alt="${label} in light and dark" loading="lazy">
        <figcaption>${label} <span>light | dark</span></figcaption>
      </figure>`,
  )
  .join('\n');

const arabicRows = ARABIC.filter(([n]) => readdirSync(PAIRS).includes(`${n}.png`))
  .map(
    ([name, label]) => `      <figure>
        <img src="pairs/${name}.png" alt="${label} in Arabic, light and dark" loading="lazy">
        <figcaption dir="rtl" lang="ar">${label} <span>فاتح | داكن</span></figcaption>
      </figure>`,
  )
  .join('\n');

const gallery = `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ORYX Marketplace — theme review</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 40px 28px 72px; background: #0b0f14; color: #e8eef5;
         font: 15px/1.55 'Segoe UI', system-ui, sans-serif; }
  header { max-width: 1180px; margin: 0 auto 32px; }
  h1 { font-size: 24px; margin: 0 0 6px; letter-spacing: .2px; }
  p.lede { color: #93a4b6; margin: 0; max-width: 74ch; }
  .meta { margin-top: 14px; color: #6f8598; font-size: 13px; }
  .sheets { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
            gap: 18px; max-width: 1180px; margin: 0 auto 40px; }
  .sheets a { display: block; border: 1px solid #1e2a36; border-radius: 12px; overflow: hidden;
              text-decoration: none; color: inherit; background: #10161d; }
  .sheets img { width: 100%; display: block; }
  .sheets span { display: block; padding: 10px 14px; font-size: 13px; color: #93a4b6; }
  .grid { max-width: 1180px; margin: 0 auto; display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; }
  figure { margin: 0; border: 1px solid #1e2a36; border-radius: 12px; overflow: hidden;
           background: #10161d; }
  figure img { width: 100%; display: block; }
  figcaption { padding: 10px 14px; font-size: 13px; color: #c6d3e0; }
  figcaption span { color: #6f8598; float: right; }
  h2 { max-width: 1180px; margin: 44px auto 16px; font-size: 17px; color: #c6d3e0; }
</style>
</head>
<body>
  <header>
    <h1>ORYX Marketplace — theme review</h1>
    <p class="lede">Every screen captured twice, once per theme, from the running
      app on a 412&times;915 handset. The dark theme is the approved one and is
      unchanged; the light theme is the correction under review.</p>
    <p class="meta">Light on the left, dark on the right.</p>
  </header>

  <div class="sheets">
    <a href="sheet-light.png"><img src="sheet-light.png" alt="Light theme contact sheet" loading="lazy"><span>Light theme — all screens</span></a>
    <a href="sheet-dark.png"><img src="sheet-dark.png" alt="Dark theme contact sheet" loading="lazy"><span>Dark theme — all screens (approved, unchanged)</span></a>
    <a href="launch-screen.png"><img src="launch-screen.png" alt="Branded launch screen"><span>Branded launch screen</span></a>
  </div>

  <h2>Light vs dark, screen by screen</h2>
  <div class="grid">
${rows}
  </div>

  <h2>Arabic (RTL)</h2>
  <div class="grid">
${arabicRows}
  </div>
</body>
</html>
`;

writeFileSync(`${DIR}/index.html`, gallery);
console.log(`  gallery              ${DIR}/index.html`);
