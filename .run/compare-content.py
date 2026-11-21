"""Compare reference vs implementation on the *app content area* only.

The approved mockups are device frames: they include the OS status bar (the
"9:41" row), which occupies roughly the top 5.7% of the frame. The web capture of
the app has no status bar. Comparing full frames therefore bakes in a constant
offset that is not a layout difference.

This crops the mockup below the status bar and re-normalises both sides to the
content area, so the remaining delta is real.
"""
from PIL import Image
import subprocess

STATUS_BAR = 0.057   # measured: the 9:41 row sits at 3.5%, its block ends ~5.7%

def ocr(path):
    subprocess.run(['tesseract', path, '/tmp/o', '-l', 'eng', '--psm', '11', 'tsv'],
                   capture_output=True)
    out = []
    for line in open('/tmp/o.tsv').readlines()[1:]:
        p = line.rstrip('\n').split('\t')
        if len(p) < 12 or not p[11].strip(): continue
        try:
            if float(p[10]) < 55: continue
        except ValueError: continue
        out.append({'t': p[11].strip(), 'y': int(p[7]), 'h': int(p[9])})
    return out

def norm(path, box, drop_status=False, scale=2):
    im = Image.open(path).convert('RGB')
    if box: im = im.crop(box)
    if drop_status:
        im = im.crop((0, int(im.height * STATUS_BAR), im.width, im.height))
    im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    im.save('/tmp/n.png')
    ws = ocr('/tmp/n.png')
    for w in ws:
        w['yp'] = (w['y'] + w['h'] / 2) / im.height * 100
        w['hp'] = w['h'] / im.height * 100
    return ws

def find(ws, n):
    for w in ws:
        if n.lower() in w['t'].lower(): return w
    return None

def row(label, ref, imp, n):
    a, b = find(ref, n), find(imp, n)
    if not a or not b:
        print(f"  {label:<24} ref {'—' if not a else f'{a[chr(121)+chr(112)]:.1f}%'}   impl {'—' if not b else f'{b[chr(121)+chr(112)]:.1f}%'}")
        return
    print(f"  {label:<24} ref {a['yp']:>5.1f}%  impl {b['yp']:>5.1f}%   Δy {b['yp']-a['yp']:>+5.1f}")

print("Reference cropped to the app content area (status bar removed); both normalised.")
ref = norm('apps/mobile/design-reference/ORYX_Splash_Reference.jpg', (161,0,695,1024), True)
imp = norm('docs/audit/exec07/splash-home/home-dark-en-phone.png', None, False)
for lbl, n in [('lockup','auto'), ('tagline','everything'), ('"Needs"','needs'),
               ('subtitle','parts'), ('search field','search'),
               ('"Spare"','spare'), ('SENSAGE','sensage'),
               ('providers','featured'), ('products','popular'),
               ('bottom nav','home')]:
    row(lbl, ref, imp, n)
