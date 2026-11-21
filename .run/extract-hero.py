"""Extract the approved hero photograph from the splash reference mockup.

The mockup is a device frame: it carries the OS status bar, the ORYX lockup, the
tagline, the subtitle and a loader over the photograph. What the owner approved
is the *photograph*; the type is reproduced in React Native, not baked in.

This masks every text/UI region with a feathered patch and inpaints it from the
surrounding pixels, so what remains is the scene alone. The result is then
cropped to the phone screen and saved as the hero asset.

Run: python3 .run/extract-hero.py
"""
from PIL import Image, ImageFilter
import numpy as np

SRC = 'apps/mobile/design-reference/ORYX_Homepage_Reference.jpg'
OUT = 'apps/mobile/assets/media/hero-approved.jpg'
OUT_SM = 'apps/mobile/assets/media/hero-approved-sm.jpg'
BOX = (161, 0, 695, 1024)   # the left phone screen

# Text / chrome regions, in the crop's own coordinates. Taken from the OCR boxes
# above, padded generously so no glyph edge survives to be mistaken for detail.
REGIONS = [
    (0, 0, 534, 60),        # OS status bar
    (60, 215, 200, 265),    # ORYX lockup
    (0, 360, 534, 700),     # tagline block and the loader area
    (40, 730, 534, 890),    # tagline + subtitle
    (0, 890, 534, 1024),    # bottom loader strip
]

im = Image.open(SRC).convert('RGB').crop(BOX)
a = np.asarray(im, float).copy()
h, w, _ = a.shape

# A mask of everything we intend to replace.
mask = np.zeros((h, w), bool)
for (x0, y0, x1, y1) in REGIONS:
    mask[max(0, y0):min(h, y1), max(0, x0):min(w, x1)] = True

# Inpaint: repeatedly grow the known pixels into the masked region, so the fill
# follows the surrounding gradients instead of a flat colour.
img = a.copy()
known = ~mask
for _ in range(140):
    if known.all():
        break
    # 3x3 mean of known neighbours, for every unknown pixel
    acc = np.zeros_like(img)
    cnt = np.zeros((h, w), float)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            sy0, sy1 = max(0, dy), h + min(0, dy)
            sx0, sx1 = max(0, dx), w + min(0, dx)
            ty0, ty1 = max(0, -dy), h + min(0, -dy)
            tx0, tx1 = max(0, -dx), w + min(0, -dx)
            src_known = known[sy0:sy1, sx0:sx1]
            acc[ty0:ty1, tx0:tx1] += img[sy0:sy1, sx0:sx1] * src_known[..., None]
            cnt[ty0:ty1, tx0:tx1] += src_known
    fillable = (~known) & (cnt > 0)
    img[fillable] = acc[fillable] / cnt[fillable][..., None]
    known = known | fillable

out = Image.fromarray(np.clip(img, 0, 255).astype('uint8'))
out = out.filter(ImageFilter.GaussianBlur(0.6))
out.save(OUT, quality=90, optimize=True)
out.resize((w // 2, h // 2), Image.LANCZOS).save(OUT_SM, quality=86, optimize=True)

m = np.asarray(out, float)
print(f'wrote {OUT} {out.size}')
print(f'  mean rgb ({m[:,:,0].mean():.0f},{m[:,:,1].mean():.0f},{m[:,:,2].mean():.0f})')
print(f'  warm fraction (r-b>18): {((m[:,:,0]-m[:,:,2])>18).mean():.3f}')
