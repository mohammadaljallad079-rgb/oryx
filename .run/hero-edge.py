"""Find where the hero photograph ends, in the reference and in the capture.

The photograph has high local variance; the flat navy below it does not. The
first row after the header where variance collapses is the hero's bottom edge.
"""
from PIL import Image
import numpy as np

def edge(path, box=None, label=''):
    im = Image.open(path).convert('RGB')
    if box: im = im.crop(box)
    a = np.asarray(im, float)
    h, w, _ = a.shape
    # local variance per row (across the middle 80% of the width)
    core = a[:, int(w*0.10):int(w*0.90)]
    var = core.reshape(h, -1, 3).std(axis=(1, 2))
    # smooth
    k = max(1, h // 200)
    sm = np.convolve(var, np.ones(k)/k, mode='same')
    print(f"\n{label}  {im.size}")
    # report variance every 2.5%
    for i in range(40):
        y = int(h*i/40)
        print(f"  {i*2.5:>5.1f}%  var={sm[y]:>6.1f}")
    return sm, h

edge('apps/mobile/design-reference/ORYX_Splash_Reference.jpg', (161,0,695,1024), 'REF homepage')
edge('docs/audit/exec07/splash-home/home-dark-en-phone.png', None, 'IMPL homepage')
