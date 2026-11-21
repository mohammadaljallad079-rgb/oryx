"""Compare the reference mockups with the implemented captures, element by element.

Both sides go through the same pipeline: crop the phone screen, OCR with word
boxes, normalise every y to a percentage of the frame height. The output is a
table of the same element on each side, so a mismatch is a number, not an
impression.
"""
from PIL import Image
import subprocess, sys, os, json

def ocr_words(img_path, lang='eng'):
    subprocess.run(['tesseract', img_path, '/tmp/ocr', '-l', lang, '--psm', '11', 'tsv'],
                   capture_output=True)
    words = []
    with open('/tmp/ocr.tsv') as f:
        for line in f.readlines()[1:]:
            p = line.rstrip('\n').split('\t')
            if len(p) < 12 or not p[11].strip():
                continue
            try:
                conf = float(p[10])
            except ValueError:
                continue
            if conf < 45:
                continue
            words.append({'t': p[11].strip(), 'x': int(p[6]), 'y': int(p[7]),
                          'w': int(p[8]), 'h': int(p[9])})
    return words

def norm(img_path, box=None, scale=1):
    im = Image.open(img_path).convert('RGB')
    if box: im = im.crop(box)
    if scale != 1: im = im.resize((im.width*scale, im.height*scale), Image.LANCZOS)
    im.save('/tmp/norm.png')
    ws = ocr_words('/tmp/norm.png')
    H = im.height
    for w in ws:
        w['yp'] = (w['y'] + w['h']/2) / H * 100
        w['xp'] = (w['x'] + w['w']/2) / im.width * 100
        w['hp'] = w['h'] / H * 100
    return ws, H

def find(ws, *needles):
    for w in ws:
        low = w['t'].lower()
        for n in needles:
            if n.lower() in low:
                return w
    return None

def row(label, ref, imp, *needles):
    a = find(ref, *needles)
    b = find(imp, *needles)
    fa = f"y={a['yp']:>5.1f}% h={a['hp']:>4.1f}%" if a else "        —      "
    fb = f"y={b['yp']:>5.1f}% h={b['hp']:>4.1f}%" if b else "        —      "
    d = f"{b['yp']-a['yp']:>+6.1f}" if (a and b) else "   n/a"
    print(f"  {label:<26} ref {fa}   impl {fb}   Δy {d}")

print("\n================ SPLASH ================")
ref, _ = norm('apps/mobile/design-reference/ORYX_Homepage_Reference.jpg', (161,0,695,1024), 2)
imp, _ = norm('docs/audit/exec07/splash-home/splash-en-phone.png', None, 2)
for lbl, n in [('lockup (AUTO)','auto'), ('tagline "Everything"','everything'),
               ('"Needs"','needs'), ('subtitle "Parts"','parts')]:
    row(lbl, ref, imp, n)

print("\n================ HOMEPAGE ================")
ref2, _ = norm('apps/mobile/design-reference/ORYX_Splash_Reference.jpg', (161,0,695,1024), 2)
imp2, _ = norm('docs/audit/exec07/splash-home/home-dark-en-phone.png', None, 2)
for lbl, n in [('header lockup','auto'), ('tagline "Everything"','everything'),
               ('"Needs"','needs'), ('subtitle "Parts"','parts'),
               ('search field','search'), ('categories label','categories'),
               ('"Spare"','spare'), ('SENSAGE','sensage'),
               ('providers label','featured'), ('products label','popular'),
               ('bottom nav "Home"','home')]:
    row(lbl, ref2, imp2, n)
