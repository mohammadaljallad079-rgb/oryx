"""Find the reference homepage's section boundaries and card geometry."""
from PIL import Image
import numpy as np

def load(p, box=None):
    im = Image.open(p).convert('RGB')
    if box: im = im.crop(box)
    return im, np.asarray(im, float)

def rows_profile(a, bg=None):
    h, w, _ = a.shape
    if bg is None:
        bg = np.median(np.concatenate([a[:20,:20].reshape(-1,3), a[-20:,:20].reshape(-1,3)]), 0)
    diff = np.abs(a - bg).sum(2)
    return (diff > 40).mean(1)

for name, path, box in [
    ('HOME-REF', 'apps/mobile/design-reference/ORYX_Splash_Reference.jpg', (161,0,695,1024)),
    ('HOME-IMPL','docs/audit/exec07/splash-home/home-dark-en-phone.png', None),
]:
    im, a = load(path, box)
    h, w, _ = a.shape
    frac = rows_profile(a)
    print(f"\n===== {name} {im.size} =====")
    # group rows into content bands (rows where >12% of pixels differ from bg)
    on = frac > 0.12
    bands, s = [], None
    for y in range(h):
        if on[y] and s is None: s = y
        elif not on[y] and s is not None:
            if y - s >= 4: bands.append((s, y))
            s = None
    if s is not None: bands.append((s, h))
    prev = None
    for (y0, y1) in bands:
        gap = '' if prev is None else f"  gap {(y0-prev)/h*100:>5.1f}%"
        print(f"  band y {y0/h*100:>5.1f}% - {y1/h*100:>5.1f}%   height {(y1-y0)/h*100:>5.1f}%{gap}")
        prev = y1
