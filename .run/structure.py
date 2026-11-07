"""Definitive vertical structure of the reference homepage.

The app background is flat navy (#00162b). The hero photograph is much brighter
and far more variable. Scanning a centre column band separates them cleanly:
navy -> photo -> navy -> cards.
"""
from PIL import Image
import numpy as np

def structure(path, box, label, navy=(0,22,43), tol=26):
    im = Image.open(path).convert('RGB')
    if box: im = im.crop(box)
    a = np.asarray(im, float); h, w, _ = a.shape
    band = a[:, int(w*0.30):int(w*0.70)]
    mean = band.mean(1)
    std  = band.reshape(h, -1, 3).std(axis=(1, 2))
    isnavy = (np.abs(band.mean(1) - np.array(navy)).sum(1) < tol*3)
    # classify each row
    cls = np.where(isnavy, 'NAVY', np.where(std > 34, 'PHOTO', 'other'))
    print(f"\n=== {label} {im.size} ===")
    prev, start = None, 0
    for y in range(h):
        if cls[y] != prev:
            if prev is not None and y - start >= 5:
                print(f"  {prev:<6} {start/h*100:>5.1f}% -> {y/h*100:>5.1f}%   ({(y-start)/h*100:>5.1f}% tall)")
            prev, start = cls[y], y
    if h - start >= 5:
        print(f"  {prev:<6} {start/h*100:>5.1f}% -> 100.0%   ({(h-start)/h*100:>5.1f}% tall)")

structure('apps/mobile/design-reference/ORYX_Splash_Reference.jpg', (161,0,695,1024), 'REF homepage')
structure('docs/audit/exec07/splash-home/home-dark-en-phone.png', None, 'IMPL homepage')
