/**
 * Derives transparent ORYX logo assets from the owner-supplied artwork.
 *
 * The source (docs/assets/logo.png.jpeg) is a JPEG: it has no alpha channel and
 * sits on a flat light-grey field. This script crops the artwork to its ink
 * bounding box and rebuilds an alpha channel from the per-pixel distance to
 * that background, producing two variants:
 *
 *   oryx-logo-on-light.png  original navy/gold colours, for light surfaces
 *   oryx-logo-on-dark.png   ink knocked out to white/steel, for navy surfaces
 *
 * Run with: node .run/gen-brand.cjs
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = 'docs/assets/logo.png.jpeg';
const OUT = 'apps/admin/public/brand';

// Ink bounding box of the artwork within the 2000x2000 source canvas.
const X0 = 277;
const Y0 = 827;
const W = 1404;
const H = 320;

// The flat field the artwork was exported onto.
const BG = [226, 227, 231];
// Distance from BG at which a pixel is treated as fully opaque ink.
const RAMP = 60;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const { width: w, channels: c } = info;

  const rgba = Buffer.alloc(W * H * 4);
  const knockout = Buffer.alloc(W * H * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = ((Y0 + y) * w + (X0 + x)) * c;
      const r = data[si];
      const g = data[si + 1];
      const b = data[si + 2];

      const d = Math.max(
        Math.abs(r - BG[0]),
        Math.abs(g - BG[1]),
        Math.abs(b - BG[2]),
      );
      const a = Math.max(0, Math.min(255, Math.round((d / RAMP) * 255)));
      const di = (y * W + x) * 4;

      rgba[di] = r;
      rgba[di + 1] = g;
      rgba[di + 2] = b;
      rgba[di + 3] = a;

      // Navy ink becomes white; the metallic highlight becomes cool steel.
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 128) {
        knockout[di] = 255;
        knockout[di + 1] = 255;
        knockout[di + 2] = 255;
      } else {
        knockout[di] = 203;
        knockout[di + 1] = 213;
        knockout[di + 2] = 225;
      }
      knockout[di + 3] = a;
    }
  }

  const raw = { width: W, height: H, channels: 4 };
  await sharp(rgba, { raw }).png().toFile(path.join(OUT, 'oryx-logo-on-light.png'));
  await sharp(knockout, { raw }).png().toFile(path.join(OUT, 'oryx-logo-on-dark.png'));

  console.log(`wrote oryx-logo-on-{light,dark}.png (${W}x${H}) to ${OUT}`);
})();
