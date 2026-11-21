from PIL import Image
import numpy as np, subprocess, os

def load(p):
    im = Image.open(p).convert('RGB')
    return im, np.asarray(im, dtype=float)

def find_screens(a):
    """Locate the two phone screens: columns/rows that differ from the page background."""
    h, w, _ = a.shape
    corners = np.concatenate([
        a[:40, :40].reshape(-1, 3), a[:40, -40:].reshape(-1, 3),
        a[-40:, :40].reshape(-1, 3), a[-40:, -40:].reshape(-1, 3)])
    bg = np.median(corners, 0)
    d = np.abs(a - bg).sum(2)
    m = d > 45
    cols = m.sum(0) / h
    # contiguous runs of "content" columns
    runs, s = [], None
    for x in range(w):
        if cols[x] > 0.35 and s is None: s = x
        elif cols[x] <= 0.35 and s is not None: runs.append((s, x)); s = None
    if s is not None: runs.append((s, w))
    runs = [r for r in runs if r[1] - r[0] > 120]
    return bg, runs

def analyse(name, path):
    im, a = load(path)
    h, w, _ = a.shape
    bg, runs = find_screens(a)
    print(f"\n===== {name}  {im.size}  bg={tuple(int(x) for x in bg)}  screens={runs}")
    for i, (x0, x1) in enumerate(runs):
        col = a[:, x0:x1]
        # row extent within this screen
        m = np.abs(col - bg).sum(2) > 45
        rows = m.sum(1) / (x1 - x0)
        ys = np.where(rows > 0.5)[0]
        y0, y1 = (int(ys.min()), int(ys.max())) if len(ys) else (0, h)
        crop = im.crop((x0, y0, x1, y1))
        out = f".run/ref/{name}-s{i}.png"
        crop.save(out)
        print(f"  screen {i}: x={x0}-{x1} ({x1-x0}px)  y={y0}-{y1} ({y1-y0}px)  aspect={(x1-x0)/(y1-y0):.3f}  -> {out}")
        # band colours
        ca = np.asarray(crop, dtype=float)
        ch = ca.shape[0]
        for b in range(20):
            band = ca[int(ch*b/20):int(ch*(b+1)/20)]
            mm = band.reshape(-1, 3).mean(0)
            lum = band.mean()
            print(f"     {b*5:>3}-{b*5+5:>3}%  rgb=({int(mm[0]):>3},{int(mm[1]):>3},{int(mm[2]):>3})  lum={lum:>6.1f}")

analyse('SPLASHREF', 'apps/mobile/design-reference/ORYX_Homepage_Reference.jpg')
analyse('HOMEREF',   'apps/mobile/design-reference/ORYX_Splash_Reference.jpg')
