"""Derive the splash hero from a bundled photograph, fitted to the reference.

The reference splash is a cinematic golden-hour frame: warm, but not a gold
filter. Its mid-frame measures (172,140,106). The bundled garage photograph's
mid measures (135,110,56) — darker and far more saturated. This grade desaturates
it and then fits each channel so the mid-tone lands on the reference's own value.

It writes a NEW asset; the source photograph is untouched, because other screens
use it.
"""
from PIL import Image, ImageEnhance
import numpy as np

SRC = 'apps/mobile/assets/media/garage-interior.jpg'
DST = 'apps/mobile/assets/media/golden-hour-hero.jpg'
DST_SM = 'apps/mobile/assets/media/golden-hour-hero-sm.jpg'
REF = np.array([172.0, 140.0, 106.0])

im = Image.open(SRC).convert('RGB')
w, h = im.size
band = slice(int(h * 0.30), int(h * 0.70))

a = np.asarray(im, float)
print(f'source mid       {a[band].reshape(-1,3).mean(0).round(1)}')

# Desaturate to take the neon warmth out, keeping the photograph's structure.
out = ImageEnhance.Color(im).enhance(0.55)
b = np.asarray(out, float)
mid = b[band].reshape(-1, 3).mean(0)
print(f'desaturated mid  {mid.round(1)}')

# Fit each channel to the reference mid-tone.
gain = REF / np.maximum(mid, 1.0)
print(f'channel gain     {gain.round(3)}')
b = np.clip(b * gain, 0, 255)
out = Image.fromarray(b.astype('uint8'))

m = np.asarray(out, float)[band].reshape(-1, 3).mean(0)
print(f'graded mid       {m.round(1)}   target {REF}   warmth {m[0]-m[2]:.0f} (target {REF[0]-REF[2]:.0f})')

out.save(DST, quality=88, optimize=True)
out.resize((max(1, w // 2), max(1, h // 2)), Image.LANCZOS).save(DST_SM, quality=84, optimize=True)
print(f'wrote {DST} {out.size}')
