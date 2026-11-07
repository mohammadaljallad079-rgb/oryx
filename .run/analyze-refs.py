"""Identify each reference by composition and map its elements.

Filenames are not trustworthy here, so each file is read by what it draws.
"""
from PIL import Image
import subprocess, numpy as np

def words(path, scale=2, conf=45):
    im = Image.open(path).convert('RGB')
    im = im.resize((im.width*scale, im.height*scale), Image.LANCZOS)
    im.save('/tmp/ref/_w.png')
    subprocess.run(['tesseract','/tmp/ref/_w.png','/tmp/ref/_w','-l','eng','--psm','11','tsv'],
                   capture_output=True)
    out=[]
    for line in open('/tmp/ref/_w.tsv').readlines()[1:]:
        p=line.rstrip('\n').split('\t')
        if len(p)<12 or not p[11].strip(): continue
        try:
            if float(p[10])<conf: continue
        except ValueError: continue
        out.append({'t':p[11].strip(),'y':(int(p[7])+int(p[9])/2)/scale,
                    'x':(int(p[6])+int(p[8])/2)/scale})
    return out, im.height//scale

FILES = [('ORYX_Splash_Reference.jpg','FILE named "Splash"'),
         ('ORYX_Homepage_Reference.jpg','FILE named "Homepage"')]

for fname, label in FILES:
    p='apps/mobile/design-reference/'+fname
    im=Image.open(p); w,h=im.size
    print(f'\n{"="*66}\n{label}   ({fname})  {im.size}\n{"="*66}')
    ws,H = words('/tmp/ref/'+fname.replace('.jpg','-L.png') if False else p)
    # left screen only
    left = Image.open(p).crop((0,0,w//2,h))
    left.save('/tmp/ref/_left.png')
    lw, LH = words('/tmp/ref/_left.png')
    keys = ['everything','needs','parts','spare','maintenance','inspection','towing',
            'sensage','bmw','popular','featured','home','categories','search','bookings',
            'profile','accessories','auto','oryx','explore','providers','view']
    seen=[]
    for k in keys:
        for x in lw:
            if k in x['t'].lower():
                seen.append((round(x['y']/LH*100,1), k, x['t'][:22]))
                break
    for yp,k,t in sorted(seen):
        print(f'   y {yp:>5.1f}%   {k:<14} "{t}"')
    print(f'   -> distinct sections detected: {len(seen)}')
