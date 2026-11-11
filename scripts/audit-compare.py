"""Compare the approved reference against the live capture.

Produces a side-by-side and a difference heatmap, and prints the metrics used
in the visual audit report: overall mean absolute difference, the palette
dominance of each image, and the per-region divergence so the report can say
*where* the two differ rather than only that they do.
"""

import os

from PIL import Image, ImageChops, ImageStat

ROOT = '/workspace/project/oryx'
REF = os.path.join(ROOT, 'docs/assets/ORYX Auto Services Dashboard.png')
LIVE = os.path.join(ROOT, 'docs/audit/screenshots/dashboard-reference-viewport-ar-dark.png')
OUT = os.path.join(ROOT, 'docs/audit/comparison')


def dominant_colors(img, n=6):
    small = img.convert('RGB').resize((256, 171))
    quant = small.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    palette = quant.getpalette()
    counts = sorted(quant.getcolors(), reverse=True)
    out = []
    for count, idx in counts:
        r, g, b = palette[idx * 3: idx * 3 + 3]
        out.append((count, f'#{r:02x}{g:02x}{b:02x}'))
    return out


def region_diff(ref, live, rows=4, cols=4):
    w, h = ref.size
    cw, ch = w // cols, h // rows
    out = []
    for r in range(rows):
        row = []
        for c in range(cols):
            box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
            diff = ImageChops.difference(ref.crop(box), live.crop(box))
            row.append(round(ImageStat.Stat(diff).mean[0], 1))
        out.append(row)
    return out


os.makedirs(OUT, exist_ok=True)
ref = Image.open(REF).convert('RGB')
live = Image.open(LIVE).convert('RGB')
print('reference', ref.size, 'live', live.size)

diff = ImageChops.difference(ref, live)
stat = ImageStat.Stat(diff)
print('mean abs diff per channel:', [round(v, 2) for v in stat.mean])
print('rms diff:', [round(v, 2) for v in stat.rms])

print('\ndominant colors — reference:')
for count, hexv in dominant_colors(ref):
    print(f'  {hexv}  {count * 100 // (256 * 171)}%')
print('dominant colors — live:')
for count, hexv in dominant_colors(live):
    print(f'  {hexv}  {count * 100 // (256 * 171)}%')

print('\n4x4 region mean abs diff (0-255):')
for row in region_diff(ref, live):
    print('  ', row)

# side by side at half scale
half = (ref.width // 2, ref.height // 2)
side = Image.new('RGB', (half[0] * 2 + 8, half[1]), (10, 14, 22))
side.paste(ref.resize(half), (0, 0))
side.paste(live.resize(half), (half[0] + 8, 0))
side.save(os.path.join(OUT, 'live-side-by-side.png'))

# amplified difference heatmap
amp = diff.point(lambda v: min(255, v * 4))
amp.save(os.path.join(OUT, 'live-diff-amplified.png'))
print('\nwrote', OUT)
