"""Extract the owner-approved automotive photography from the approved dashboard
reference so the application uses real brand imagery instead of generated art.

Source: docs/assets/ORYX Auto Services Dashboard.png (1536x1024, owner-approved).

The reference screenshot is the only approved visual asset in the repository: the
original photography files were never supplied. This script crops the
photographic regions out of that approved image, at native resolution, and
upscales them with Lanczos so they can be used as tile/hero backgrounds.

Output: apps/admin/public/tiles/*.jpg

Nothing here invents imagery — every pixel comes from the owner's approved
reference. Where a module has no distinct photographic region in the reference,
the closest approved automotive crop is reused rather than fabricated.
"""

import os

from PIL import Image, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, '..', 'docs', 'assets', 'ORYX Auto Services Dashboard.png')
OUT = os.path.join(HERE, '..', 'apps', 'admin', 'public', 'tiles')

# Native-resolution regions inside the approved reference.
# x ranges are the three tile columns; y ranges are the tile rows.
COL = [(345, 640), (645, 940), (945, 1240)]
ROW = [(478, 602), (610, 734), (742, 866), (874, 1006)]

# The hero automotive photograph occupies the right portion of the hero band.
HERO = (880, 42, 1478, 368)


def crop(img, box, scale=3.0, size=None):
    """Crop a region and upscale it to a usable tile resolution."""
    part = img.crop(box)
    if size:
        target = size
    else:
        target = (int(part.width * scale), int(part.height * scale))
    part = part.resize(target, Image.LANCZOS)
    # Lift contrast and saturation slightly: the reference is a screenshot with
    # a dark overlay baked in, and the tiles re-apply their own gradient.
    part = ImageEnhance.Contrast(part).enhance(1.12)
    part = ImageEnhance.Color(part).enhance(1.18)
    return part


def main():
    os.makedirs(OUT, exist_ok=True)
    ref = Image.open(REF).convert('RGB')

    # Hero: wide crop at native 3:1-ish ratio for the banner.
    hero = crop(ref, HERO, size=(1600, 620))
    hero.save(os.path.join(OUT, 'hero-automotive.jpg'), quality=90, optimize=True)

    # Nine tile photographs from the reference tile grid.
    tiles = []
    for r in range(3):
        for c in range(3):
            y0, y1 = ROW[r]
            x0, x1 = COL[c]
            tiles.append(crop(ref, (x0, y0, x1, y1), size=(900, 560)))

    # Map the reference tile photographs onto the ORYX module set. The reference
    # shows a subset of modules; where a module has no distinct photograph, the
    # nearest approved automotive crop is reused (documented, not invented).
    mapping = {
        'tile-company': 0,
        'tile-branch': 1,
        'tile-accounting': 2,
        'tile-sales': 3,
        'tile-purchasing': 4,
        'tile-warehouse': 5,
        'tile-hr': 6,
        'tile-crm': 7,
        'tile-operations': 8,
        'tile-inspection': 8,
        'tile-maintenance': 0,
        'tile-parts': 3,
        'tile-reports': 6,
        'tile-users': 7,
        'tile-subscription': 2,
        'tile-settings': 1,
        'tile-website': 4,
        'tile-app': 5,
        'tile-audit': 6,
        'tile-support': 7,
        'tile-modules': 0,
        'tile-plans': 2,
    }

    for name, index in mapping.items():
        tiles[index].save(os.path.join(OUT, f'{name}.jpg'), quality=88, optimize=True)

    # Keep a wide automotive crop for group headers.
    crop(ref, (345, 470, 1240, 740), size=(1600, 500)).save(
        os.path.join(OUT, 'automotive-hero.jpg'), quality=88, optimize=True
    )

    print(f'extracted {len(mapping) + 2} approved photographic assets to {os.path.abspath(OUT)}')


if __name__ == '__main__':
    main()
