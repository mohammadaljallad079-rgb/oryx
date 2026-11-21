"""Extract the approved splash scene cleanly.

The previous version multiplied its mask coordinates by the upscale factor,
which pushed the masks off the real text: the extracted image still carried
"Everything Your Car Needs" and "Parts · Services · Trusted Providers", so the
app drew its own text on top of the old text and the screen showed it twice.

This works in the ORIGINAL 533x1024 coordinate space for the mask, so every
rectangle lands where it was measured, then upscales the RESULT. Mask first,
enlarge second — the opposite order was the bug.
"""
from PIL import Image, ImageFilter
import numpy as np, subprocess, os

SRC = 'apps/mobile/design-reference/ORYX_Homepage_Reference.jpg'
SCREEN = (161, 0, 694, 1024)          # the mockup's phone screen, 533x1024
OUT = 'apps/mobile/assets/media/splash-scene.jpg'
OUT_SM = 'apps/mobile/assets/media/splash-scene-sm.jpg'

os.makedirs('/tmp/ref', exist_ok=True)
base = Image.open(SRC).convert('RGB').crop(SCREEN)
w, h = base.size                        # 533 x 1024 — mask in THIS space

# --- locate every glyph box at the original scale -------------------------
base.resize((w * 2, h * 2), Image.LANCZOS).save('/tmp/ref/_m.png')
subprocess.run(['tesseract', '/tmp/ref/_m.png', '/tmp/ref/_m', '-l', 'eng', '--psm', '11', 'tsv'],
               capture_output=True)

# The only bands that hold text, measured earlier from the mockup.
TEXT_BANDS = [(0, 60), (205, 275), (740, 830), (845, 882), (968, 1015)]
glyphs = []
for line in open('/tmp/ref/_m.tsv').readlines()[1:]:
    p = line.rstrip('\n').split('\t')
    if len(p) < 12 or not p[11].strip():
        continue
    try:
        if float(p[10]) < 25:
            continue
    except ValueError:
        continue
    x, y = int(p[6]) // 2, int(p[7]) // 2
    bw, bh = int(p[8]) // 2, int(p[9]) // 2
    if not any(y0 <= y + bh / 2 <= y1 for (y0, y1) in TEXT_BANDS):
        continue
    glyphs.append((x, y, bw, bh))

# The lockup is artwork, not OCR text: find the bright block directly.
lum = np.asarray(base.convert('L'), float)
band = lum[205:275]
cols = np.where((band > 150).mean(0) > 0.04)[0]
lock = (int(cols.min()), 205, int(cols.max() - cols.min()), 70) if len(cols) \
    else (60, 210, 200, 60)

mask = np.zeros((h, w), bool)
mask[0:58, :] = True                                     # OS status bar
mask[lock[1]:lock[1] + lock[3], lock[0]:lock[0] + lock[2]] = True   # ORYX lockup
for (x, y, bw, bh) in glyphs:                            # every real glyph
    P = 4
    mask[max(0, y - P):min(h, y + bh + P), max(0, x - P):min(w, x + bw + P)] = True
# The gold rule and the loader, which OCR reads as punctuation.
mask[640:740, 0:60] = True
mask[940:1015, 100:440] = True

# --- fill, seeded from the nearest known pixel ----------------------------
a = np.asarray(base, float).copy()
from scipy import ndimage
ind = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
img = a[tuple(ind)]

# Diffuse so the seam softens rather than showing a hard edge.
for _ in range(80):
    acc = np.zeros_like(img); cnt = np.zeros((h, w), float)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            sy0, sy1 = max(0, dy), h + min(0, dy)
            sx0, sx1 = max(0, dx), w + min(0, dx)
            ty0, ty1 = max(0, -dy), h + min(0, -dy)
            tx0, tx1 = max(0, -dx), w + min(0, -dx)
            acc[ty0:ty1, tx0:tx1] += img[sy0:sy1, sx0:sx1]
            cnt[ty0:ty1, tx0:tx1] += 1
    img[mask] = (acc / cnt[..., None])[mask]

clean = Image.fromarray(np.clip(img, 0, 255).astype('uint8'))

# --- now enlarge the CLEANED image ---------------------------------------
final = clean.resize((int(w * 1.6), int(h * 1.6)), Image.LANCZOS)
final = final.filter(ImageFilter.UnsharpMask(radius=1.1, percent=45, threshold=4))
final.save(OUT, quality=93, optimize=True, subsampling=0)
final.resize((final.width // 2, final.height // 2), Image.LANCZOS).save(OUT_SM, quality=90, optimize=True)

print(f'wrote {OUT} {final.size} (was 533x1024, upscale on device x{1080/final.width:.2f})')
print(f'  masked {mask.mean()*100:.1f}% of pixels')
