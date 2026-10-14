"""Build the side-by-side and overlay comparisons for the design review.

Compares the owner-approved dashboard reference
(docs/assets/ORYX Auto Services Dashboard.png) against the actual implemented
dashboard captured in a real browser at the same viewport
(docs/execution-reports/screenshots/dashboard-reference-viewport-ar-dark.png).

Outputs into docs/execution-reports/comparison/:
  - side-by-side.png          reference and implementation, equal height
  - side-by-side-detail.png   the top third of both, at native scale
  - overlay.png               the implementation at 50% over the reference

Requires Pillow.
"""

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
REFERENCE = os.path.join(ROOT, 'docs', 'assets', 'ORYX Auto Services Dashboard.png')
IMPLEMENTED = os.path.join(
    ROOT, 'docs', 'execution-reports', 'screenshots', 'dashboard-reference-viewport-ar-dark.png'
)
OUT = os.path.join(ROOT, 'docs', 'execution-reports', 'comparison')

LABEL_HEIGHT = 34


def _label(width: str, text: str) -> Image.Image:
    """A simple caption strip drawn without external font dependencies."""
    from PIL import ImageDraw

    strip = Image.new('RGB', (width, LABEL_HEIGHT), (10, 14, 22))
    draw = ImageDraw.Draw(strip)
    draw.text((12, 10), text, fill=(212, 175, 55))
    return strip


def _stack(label: str, image: Image.Image, width: int) -> Image.Image:
    scaled = image.resize((width, int(image.height * width / image.width)), Image.LANCZOS)
    canvas = Image.new('RGB', (width, LABEL_HEIGHT + scaled.height), (10, 14, 22))
    canvas.paste(_label(width, label), (0, 0))
    canvas.paste(scaled, (0, LABEL_HEIGHT))
    return canvas


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    ref = Image.open(REFERENCE).convert('RGB')
    impl = Image.open(IMPLEMENTED).convert('RGB')

    print(f'reference   {ref.width}x{ref.height}')
    print(f'implementation {impl.width}x{impl.height}')

    # ---------------------------------------------------------- side by side
    height = 720
    ref_scaled = ref.resize((int(ref.width * height / ref.height), height), Image.LANCZOS)
    impl_scaled = impl.resize((int(impl.width * height / impl.height), height), Image.LANCZOS)
    gap = 16
    canvas = Image.new(
        'RGB', (ref_scaled.width + impl_scaled.width + gap, height + LABEL_HEIGHT), (10, 14, 22)
    )
    canvas.paste(_label(ref_scaled.width, 'APPROVED REFERENCE (owner)'), (0, 0))
    canvas.paste(
        _label(impl_scaled.width, 'IMPLEMENTED (browser, Arabic dark)'), (ref_scaled.width + gap, 0)
    )
    canvas.paste(ref_scaled, (0, LABEL_HEIGHT))
    canvas.paste(impl_scaled, (ref_scaled.width + gap, LABEL_HEIGHT))
    canvas.save(os.path.join(OUT, 'side-by-side.png'))
    print('wrote side-by-side.png')

    # ------------------------------------------------- top-third detail view
    # The hero, header and first tile row are where the composition matters most.
    cut_ref = ref.crop((0, 0, ref.width, int(ref.height * 0.45)))
    cut_impl = impl.crop((0, 0, impl.width, int(impl.height * 0.45)))
    top = _stack('APPROVED REFERENCE — header, hero, first tile row', cut_ref, 1180)
    bottom = _stack('IMPLEMENTED — header, hero, first tile row', cut_impl, 1180)
    detail = Image.new('RGB', (1180, top.height + bottom.height + 12), (10, 14, 22))
    detail.paste(top, (0, 0))
    detail.paste(bottom, (0, top.height + 12))
    detail.save(os.path.join(OUT, 'side-by-side-detail.png'))
    print('wrote side-by-side-detail.png')

    # --------------------------------------------------------------- overlay
    blend = Image.blend(ref.resize(impl.size, Image.LANCZOS), impl, 0.5)
    blend.save(os.path.join(OUT, 'overlay.png'))
    print('wrote overlay.png')


if __name__ == '__main__':
    main()
