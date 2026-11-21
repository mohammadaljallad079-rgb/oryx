/**
 * Builds side-by-side comparison sheets for the visual audit.
 *
 * Each sheet stacks the owner-approved reference above the implemented screen
 * so a reviewer can judge parity directly. Run with:
 *   node .run/make-comparison.cjs
 */
const sharp = require('sharp');
const path = require('path');

const BRAND = 'docs/audit/branding';
const REF = 'docs/assets/ORYX Auto Services Dashboard.png';
const W = 1536;
const GAP = 24;

async function sheet(reference, shots, out) {
  const tiles = [];
  let y = 0;

  const refBuf = await sharp(reference).resize(W, null, { fit: 'inside' }).png().toBuffer();
  const refMeta = await sharp(refBuf).metadata();
  tiles.push({ input: refBuf, top: y, left: 0 });
  y += refMeta.height + GAP;

  for (const shot of shots) {
    const buf = await sharp(path.join(BRAND, shot)).resize(W, null, { fit: 'inside' }).png().toBuffer();
    const meta = await sharp(buf).metadata();
    tiles.push({ input: buf, top: y, left: 0 });
    y += meta.height + GAP;
  }

  await sharp({
    create: {
      width: W,
      height: y,
      channels: 3,
      background: { r: 12, g: 14, b: 18 },
    },
  })
    .composite(tiles)
    .png()
    .toFile(path.join(BRAND, out));

  console.log(`${out} (${W}x${y})`);
}

(async () => {
  await sheet(REF, ['after-dashboard-ar-dark.png'], 'compare-dark-ar.png');
  await sheet(REF, ['after-dashboard-en-dark.png'], 'compare-dark-en.png');
  await sheet(REF, ['after-dashboard-ar-light.png'], 'compare-light-ar.png');
  await sheet(REF, ['after-login-ar-dark.png'], 'compare-login.png');
})();
