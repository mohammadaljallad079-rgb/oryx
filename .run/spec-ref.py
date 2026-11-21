from PIL import Image
import numpy as np

def load(path, box):
    im = Image.open(path).convert('RGB')
    c = im.crop(box)
    return c, np.asarray(c, float)

def lines(lum, thresh, minfrac, minrun=5):
    rows = (lum > thresh).mean(1) > minfrac
    out, s = [], None
    for y in range(len(rows)):
        if rows[y] and s is None: s = y
        elif not rows[y] and s is not None:
            if y - s >= minrun: out.append((s, y))
            s = None
    if s is not None and len(rows)-s >= minrun: out.append((s, len(rows)))
    return out

def report(name, path, box):
    crop, a = load(path, box)
    h, w, _ = a.shape
    lum = a.mean(2)
    print(f"\n===== {name} {crop.size} =====")
    for th in (235, 215, 195):
        ls = lines(lum, th, 0.003)
        print(f"  bright>{th}: " + ", ".join(f"{y0}-{y1}({(y0+y1)/2/h*100:.1f}%)" for y0,y1 in ls[:14]))
    r, g, b = a[:,:,0], a[:,:,1], a[:,:,2]
    gm = (r > 150) & (g > 110) & (g < 215) & (b < 130) & (r - b > 60)
    rows = gm.mean(1) > 0.01
    gs, s = [], None
    for y in range(h):
        if rows[y] and s is None: s = y
        elif not rows[y] and s is not None:
            if y - s >= 4: gs.append((s,y))
            s = None
    print("  gold rows: " + ", ".join(f"{y0}-{y1}({(y0+y1)/2/h*100:.1f}%)" for y0,y1 in gs[:10]))
    bb = a[int(h*0.94):]
    print(f"  bottom 6%: rgb=({bb[:,:,0].mean():.0f},{bb[:,:,1].mean():.0f},{bb[:,:,2].mean():.0f})")
    crop.save(f".run/ref/{name}.png")

report('splash-ref', 'apps/mobile/design-reference/ORYX_Homepage_Reference.jpg', (161,0,695,1024))
report('home-ref', 'apps/mobile/design-reference/ORYX_Splash_Reference.jpg', (161,0,695,1024))
