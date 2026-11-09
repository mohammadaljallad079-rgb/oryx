from PIL import Image
import numpy as np

def bands(path, label, n=20):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im, float); h = a.shape[0]
    print(f"\n== {label} {im.size} ==")
    for b in range(n):
        s = a[int(h*b/n):int(h*(b+1)/n)]
        m = s.reshape(-1,3).mean(0)
        print(f"  {b*5:>3}-{b*5+5:>3}%  rgb=({int(m[0]):>3},{int(m[1]):>3},{int(m[2]):>3})  lum={s.mean():>6.1f}")

def blocks(path, label, bright=195):
    a = np.asarray(Image.open(path).convert('RGB'), float)
    h, w, _ = a.shape
    lum = a.mean(2); m = lum > bright
    rows = m.mean(1) > 0.003
    out, s = [], None
    for y in range(h):
        if rows[y] and s is None: s = y
        elif not rows[y] and s is not None:
            if y-s >= 5: out.append((s,y))
            s = None
    if s is not None and h-s>=5: out.append((s,h))
    print(f"\n-- {label} text blocks (centre % of height) --")
    for y0,y1 in out:
        print(f"   y {y0:>4}-{y1:>4}   centre {(y0+y1)/2/h*100:>5.1f}%")

bands('apps/mobile/design-reference/ORYX_Homepage_Reference.jpg', 'REFERENCE splash (hero)')
blocks('.run/ref/SPLASH-crop.png', 'REFERENCE splash')
bands('docs/audit/exec07/splash-home/splash-en-phone.png', 'IMPLEMENTED splash')
blocks('docs/audit/exec07/splash-home/splash-en-phone.png', 'IMPLEMENTED splash')
