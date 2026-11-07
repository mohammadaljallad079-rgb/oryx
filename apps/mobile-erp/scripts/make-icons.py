"""Generate the neutral ORYX mobile placeholder icons.

The official ORYX logo is not present in the repository, so the mobile app uses
the same navy/gold monogram placeholder as the web surfaces rather than inventing
a brand mark. Run from `apps/mobile`: `python3 scripts/make-icons.py`.
"""

from PIL import Image, ImageDraw

NAVY = (0, 22, 43, 255)
GOLD = (212, 175, 55, 255)


def monogram(width: int, height: int) -> Image.Image:
    img = Image.new('RGBA', (width, height), NAVY)
    draw = ImageDraw.Draw(img)
    cx, cy = width / 2, height / 2
    outer = min(width, height) * 0.30
    draw.ellipse(
        [cx - outer, cy - outer, cx + outer, cy + outer],
        outline=GOLD,
        width=max(2, int(outer * 0.24)),
    )
    bar = outer * 0.62
    thick = max(2, int(outer * 0.20))
    draw.rectangle([cx - bar, cy - thick, cx + bar, cy + thick], fill=GOLD)
    return img


def main() -> None:
    monogram(1024, 1024).save('assets/icon.png')
    monogram(1024, 1024).save('assets/adaptive-icon.png')
    splash = Image.new('RGBA', (1284, 2778), NAVY)
    mark = monogram(512, 512)
    splash.paste(mark, ((1284 - 512) // 2, (2778 - 512) // 2), mark)
    splash.save('assets/splash.png')
    print('wrote assets/icon.png, assets/adaptive-icon.png, assets/splash.png')


if __name__ == '__main__':
    main()
