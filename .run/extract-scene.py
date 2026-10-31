"""Extract the approved splash scene, masking only the glyphs themselves.

The scene's text sits directly over the vehicle, so any inpaint damages the car.
The solution is not a bigger mask but an exact one: mask the glyph boxes tightly,
and then draw the real UI text at the same positions, so the repaired pixels are
covered by the text that belongs there. Nothing visible is left smudged.

The previous attempt masked y 360-700 as one band — the vehicle's own band — and
produced large smudges in regions where no text was ever drawn.

Run: python3 .run/extract-scene.py
"""
from PIL import Image, ImageFilter
import numpy as np, subprocess, json

SRC = 'apps/mobile/design-reference/ORYX_Homepage_Reference.jpg'
SCREEN = (161, 0, 694, 1024)          # the left phone screen
OUT = 'apps/mobile/assets/media/splash-scene.jpg'
OUT_SM = 'apps/mobile/assets/media/splash-scene-sm.jpg'
MAP = 'docs/audit/exec07/splash-home/scene-text-map.json'

im = Image.open(SRC).convert('RGB').crop(SCREEN)
w, h = im.size

# --- locate every glyph box ---------------------------------------------------
im.resize((w*2, h*2), Image.LANCZOS).save('/tmp/ref/_s.png')
subprocess.run(['tesseract','/tmp/ref/_s.png','/tmp/ref/_s','-l','eng','--psm','11','tsv'],
               capture_output=True)
# Only the blocks that are genuinely text. OCR also fires on the car's own
# detail — grille slats, lights, wheel spokes read as "Were", "SSS", "|" — and
# masking those would erase the vehicle. The real text sits in four bands, all of
# which were confirmed at high confidence in the earlier analysis.
TEXT_BANDS = [
    (0,    60,   'status bar'),
    (205,  275,  'ORYX lockup'),
    (740,  830,  'tagline: Everything Your Car Needs'),
    (845,  882,  'subtitle: Parts / Services / Trusted Providers'),
    (968,  1015, 'loader'),
]
glyphs = []
for line in open('/tmp/ref/_s.tsv').readlines()[1:]:
    p = line.rstrip('\n').split('\t')
    if len(p) < 12 or not p[11].strip():
        continue
    try:
        conf = float(p[10])
    except ValueError:
        continue
    if conf < 25:
        continue
    x, y = int(p[6])//2, int(p[7])//2
    bw, bh = int(p[8])//2, int(p[9])//2
    if not any(y0 <= y+bh/2 <= y1 for (y0, y1, _) in TEXT_BANDS):
        continue
    glyphs.append({'t': p[11].strip(), 'x': x, 'y': y, 'w': bw, 'h': bh})

# The lockup is artwork, not text OCR can bound, so it is measured directly:
# the bright block in the 205-275 row band.
lum = np.asarray(im.convert('L'), float)
band = lum[205:275]
cols = np.where((band > 150).mean(0) > 0.04)[0]
lock = (int(cols.min()), 205, int(cols.max() - cols.min()), 70) if len(cols) else (60, 210, 200, 60)

mask = np.zeros((h, w), bool)
mask[0:58, :] = True                                       # OS status bar
mask[lock[1]:lock[1]+lock[3], lock[0]:lock[0]+lock[2]] = True   # ORYX lockup
for g in glyphs:
    if g['y'] < 60:                                        # already covered
        continue
    P = 3
    mask[max(0,g['y']-P):min(h,g['y']+g['h']+P),
         max(0,g['x']-P):min(w,g['x']+g['w']+P)] = True

# The gold rule and loader the mockup draws, which OCR reads as punctuation.
mask[640:740, 0:60] = True
mask[940:1015, 100:440] = True

a = np.asarray(im, float).copy()
known = ~mask
img = a.copy()
for _ in range(220):
    if known.all():
        break
    acc = np.zeros_like(img); cnt = np.zeros((h, w), float)
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            sy0,sy1 = max(0,dy), h+min(0,dy)
            sx0,sx1 = max(0,dx), w+min(0,dx)
            ty0,ty1 = max(0,-dy), h+min(0,-dy)
            tx0,tx1 = max(0,-dx), w+min(0,-dx)
            k = known[sy0:sy1, sx0:sx1]
            acc[ty0:ty1, tx0:tx1] += img[sy0:sy1, sx0:sx1] * k[...,None]
            cnt[ty0:ty1, tx0:tx1] += k
    fill = (~known) & (cnt > 0)
    img[fill] = acc[fill] / cnt[fill][...,None]
    known = known | fill

out = Image.fromarray(np.clip(img,0,255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.4))
out.save(OUT, quality=92, optimize=True)
out.resize((w//2, h//2), Image.LANCZOS).save(OUT_SM, quality=88, optimize=True)

# Where the real UI text must be drawn, so it covers the repaired pixels.
ys = [g['y'] for g in glyphs if g['y'] > 60]
lines = {}
for g in glyphs:
    if g['y'] <= 60: continue
    key = round(g['y']/8)*8
    lines.setdefault(key, []).append(g)
mapout = {
    'screen': [w, h],
    'lockup':  {'yPct': round((lock[1]+lock[3]/2)/h*100, 1), 'xPct': 50.0},
    'textLines': sorted(
        [{'yPct': round((k+max(g['h'] for g in v)/2)/h*100, 1),
          'text': ' '.join(g['t'] for g in sorted(v, key=lambda z: z['x']))}
         for k, v in lines.items()],
        key=lambda d: d['yPct']),
}
import os; os.makedirs(os.path.dirname(MAP), exist_ok=True)
json.dump(mapout, open(MAP,'w'), indent=2)

b = np.asarray(out, float); L = b.mean(2)
gy = np.abs(np.diff(L,axis=0)); gx = np.abs(np.diff(L,axis=1))
e = np.zeros_like(L); e[:,:-1]+=gx; e[:-1,:]+=gy
print(f'wrote {OUT} {out.size}  (masked {mask.mean()*100:.1f}%)')
print('detail retained (the vehicle is the 40-85% band):')
for i in range(10):
    y0,y1 = int(h*i/10), int(h*(i+1)/10)
    print(f'  {i*10:>3}-{i*10+10:>3}%  lum={L[y0:y1].mean():>6.1f}  detail={e[y0:y1].mean():>6.2f}')
print('\ntext map written to', MAP)
print(json.dumps(mapout['textLines'], indent=1))
