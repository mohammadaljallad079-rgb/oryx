from PIL import Image
import numpy as np

def text_blocks(a, bright_min=150, min_run=6):
    """Rows containing bright (text/logo) pixels, grouped into blocks."""
    lum = a.mean(2)
    bright = lum > bright_min
    rowfrac = bright.mean(1)
    rows = rowfrac > 0.004
    blocks, s = [], None
    for y in range(len(rows)):
        if rows[y] and s is None: s = y
        elif not rows[y] and s is not None:
            if y - s >= min_run: blocks.append((s, y))
            s = None
    if s is not None and len(rows) - s >= min_run: blocks.append((s, len(rows)))
    out = []
    for (y0, y1) in blocks:
        band = bright[y0:y1]
        xs = np.where(band.any(0))[0]
        if not len(xs): continue
        out.append((y0, y1, int(xs.min()), int(xs.max())))
    return out

for name, path, box in [
    ('SPLASH', 'apps/mobile/design-reference/ORYX_Homepage_Reference.jpg', (161, 0, 695, 1024)),
    ('HOME',   'apps/mobile/design-reference/ORYX_Splash_Reference.jpg',  (195, 10, 720, 1010)),
]:
    im = Image.open(path).convert('RGB')
    crop = im.crop(box)
    a = np.asarray(crop, dtype=float)
    h, w, _ = a.shape
    print(f"\n===== {name} crop {crop.size} (w={w} h={h}) =====")
    for (y0, y1, x0, x1) in text_blocks(a):
        hh = (y1 - y0) / h
        cy = (y0 + y1) / 2 / h
        print(f"  y {y0:>4}-{y1:>4}  ({hh*100:>4.1f}% tall, centre {cy*100:>4.1f}%)   x {x0:>4}-{x1:>4}  ({(x1-x0)/w*100:>4.1f}% wide, centre {(x0+x1)/2/w*100:>4.1f}%)")
    crop.save(f'.run/ref/{name}-crop.png')
