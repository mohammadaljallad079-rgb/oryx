"""Generate abstract vector artwork for the ORYX dashboard tiles and hero.

The artwork is original generated geometry — no stock photography and no
third-party brand marks — so the dashboard stays image-led without inventing
the owner's logo asset (which is not present in the repository).

This is the single source of truth for tile art. The tiles are served as SVG
(see `tileImageUrl` in packages/shared/src/modules.ts), so there is no raster
step and no dependency on the owner's design reference.
"""

import math
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'apps', 'admin', 'public', 'tiles')
os.makedirs(OUT, exist_ok=True)

W, H = 640, 420


def wrap(name, inner):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" role="img">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#04213d"/>
    <stop offset="55%" stop-color="#001a33"/>
    <stop offset="100%" stop-color="#000d1c"/>
  </linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#e8c766"/>
    <stop offset="100%" stop-color="#a9861f"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.78" cy="0.12" r="0.85">
    <stop offset="0%" stop-color="#d4af37" stop-opacity="0.30"/>
    <stop offset="100%" stop-color="#d4af37" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
<rect width="{W}" height="{H}" fill="url(#glow)"/>
{inner}
</svg>'''
    with open(os.path.join(OUT, f'{name}.svg'), 'w', encoding='utf-8') as fh:
        fh.write(svg)


def grid():
    parts = []
    for x in range(0, W, 32):
        parts.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{H}" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>')
    for y in range(0, H, 32):
        parts.append(f'<line x1="0" y1="{y}" x2="{W}" y2="{y}" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>')
    return ''.join(parts)


def hero():
    return grid() + '''
<circle cx="500" cy="150" r="132" fill="none" stroke="url(#gold)" stroke-opacity="0.55" stroke-width="1.6"/>
<circle cx="500" cy="150" r="96" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1.2"/>
<circle cx="500" cy="150" r="30" fill="none" stroke="url(#gold)" stroke-opacity="0.75" stroke-width="2"/>
<path d="M300 330 q40 -66 130 -66 h150 q60 0 84 40 l26 26" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2"/>
<path d="M120 356 h420" stroke="url(#gold)" stroke-opacity="0.35" stroke-width="1.5"/>
<path d="M60 96 h96 M60 96 v40 M156 96 v40" fill="none" stroke="#d4af37" stroke-opacity="0.5" stroke-width="1.2"/>'''


def dashboard():
    """Operational-overview motif: a gold telemetry gauge over a KPI strip.

    Original geometry, generated here — the dashboard tile must not reuse the
    approved design reference as artwork.
    """
    bars = []
    heights = [58, 96, 74, 128, 88, 150, 112]
    for i, h in enumerate(heights):
        x = 120 + i * 58
        bars.append(
            f'<rect x="{x}" y="{300 - h}" width="26" height="{h}" rx="4" '
            f'fill="url(#gold)" fill-opacity="{0.28 + i * 0.07:.2f}"/>'
        )
    return grid() + '''
<circle cx="500" cy="150" r="118" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1.2"/>
<path d="M500 32 a118 118 0 0 1 102 59" fill="none" stroke="url(#gold)" stroke-opacity="0.85" stroke-width="4" stroke-linecap="round"/>
<path d="M500 32 a118 118 0 0 0 -102 59" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="4" stroke-linecap="round"/>
<circle cx="500" cy="150" r="78" fill="none" stroke="url(#gold)" stroke-opacity="0.45" stroke-width="1.4"/>
<circle cx="500" cy="150" r="10" fill="url(#gold)"/>
<path d="M500 150 L560 96" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>
''' + ''.join(bars) + '''
<path d="M96 300 h470" stroke="url(#gold)" stroke-opacity="0.35" stroke-width="1.5"/>
<path d="M120 340 h96 M120 340 v-22 M216 340 v-22" fill="none" stroke="#d4af37" stroke-opacity="0.5" stroke-width="1.2"/>'''


def car():
    return grid() + '''
<path d="M132 262 q18 -46 60 -50 l74 -6 q34 -2 56 22 l30 34" fill="none" stroke="#ffffff" stroke-opacity="0.20" stroke-width="2.4"/>
<path d="M110 292 h300 q34 0 46 -22" fill="none" stroke="url(#gold)" stroke-opacity="0.55" stroke-width="2"/>
<circle cx="188" cy="300" r="30" fill="none" stroke="#ffffff" stroke-opacity="0.20" stroke-width="3"/>
<circle cx="188" cy="300" r="12" fill="none" stroke="#d4af37" stroke-opacity="0.6" stroke-width="2"/>
<circle cx="392" cy="300" r="30" fill="none" stroke="#ffffff" stroke-opacity="0.20" stroke-width="3"/>
<circle cx="392" cy="300" r="12" fill="none" stroke="#d4af37" stroke-opacity="0.6" stroke-width="2"/>
<path d="M232 212 l22 44 h58 l-6 -44 z" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.6"/>'''


def building():
    return '''
<g stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.6" fill="none">
  <rect x="150" y="120" width="120" height="200"/>
  <rect x="286" y="170" width="94" height="150"/>
  <rect x="396" y="96" width="110" height="224"/>
</g>
<g stroke="#d4af37" stroke-opacity="0.55" stroke-width="1.6">
  <path d="M170 150h80M170 180h80M170 210h80M170 240h80M170 270h80"/>
  <path d="M306 200h54M306 230h54M306 260h54M306 290h54"/>
  <path d="M416 130h70M416 165h70M416 200h70M416 235h70M416 270h70"/>
</g>
<path d="M110 340 h420" stroke="url(#gold)" stroke-opacity="0.4" stroke-width="1.6"/>'''


def pin():
    return '''
<path d="M320 96 q-74 0 -74 74 q0 62 74 128 q74 -66 74 -128 q0 -74 -74 -74z" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.2"/>
<circle cx="320" cy="172" r="26" fill="none" stroke="url(#gold)" stroke-opacity="0.7" stroke-width="2.4"/>
<g stroke="#ffffff" stroke-opacity="0.10" stroke-width="1.2">
  <path d="M60 300 h140 M440 300 h140 M60 340 h90 M490 340 h90"/>
</g>
<circle cx="150" cy="300" r="6" fill="#d4af37" fill-opacity="0.7"/>
<circle cx="510" cy="340" r="6" fill="#d4af37" fill-opacity="0.7"/>'''


def chart(kind):
    if kind == 'bars':
        bars = ''.join(
            f'<rect x="{150 + i * 46}" y="{330 - v}" width="30" height="{v}" rx="4" '
            f'fill="url(#gold)" fill-opacity="{0.35 + 0.09 * i:.2f}"/>'
            for i, v in enumerate([70, 120, 92, 168, 140, 196])
        )
        return bars + '<path d="M120 340 h420" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.6"/>'
    if kind == 'line':
        return '''<path d="M110 320 L180 268 L250 292 L320 214 L390 246 L460 168 L530 196" fill="none" stroke="url(#gold)" stroke-opacity="0.85" stroke-width="2.6"/>
<g stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.2"><path d="M110 340h420M110 260h420M110 180h420"/></g>'''
    return '''<circle cx="320" cy="210" r="96" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="16"/>
<circle cx="320" cy="210" r="96" fill="none" stroke="url(#gold)" stroke-opacity="0.8" stroke-width="16" stroke-dasharray="360 604" stroke-linecap="round" transform="rotate(-90 320 210)"/>'''


def gear():
    teeth = []
    for i in range(12):
        a = math.radians(i * 30)
        x1, y1 = 320 + 92 * math.cos(a), 210 + 92 * math.sin(a)
        x2, y2 = 320 + 120 * math.cos(a), 210 + 120 * math.sin(a)
        teeth.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="#d4af37" stroke-opacity="0.5" stroke-width="8"/>'
        )
    return ''.join(teeth) + '''
<circle cx="320" cy="210" r="92" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<circle cx="320" cy="210" r="40" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<circle cx="320" cy="210" r="16" fill="none" stroke="url(#gold)" stroke-opacity="0.7" stroke-width="2.4"/>'''


def warehouse():
    return '''
<path d="M120 330 V190 L320 108 L520 190 V330" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<path d="M250 330 v-92 h140 v92" fill="none" stroke="#d4af37" stroke-opacity="0.55" stroke-width="2"/>
<g stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.4">
  <path d="M120 190 h400 M320 108 v222 M120 260 h400"/>
</g>'''


def truck():
    return '''
<rect x="120" y="176" width="220" height="112" rx="6" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<path d="M340 210 h70 l60 62 v16 h-130z" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<circle cx="188" cy="300" r="26" fill="none" stroke="url(#gold)" stroke-opacity="0.65" stroke-width="2.6"/>
<circle cx="410" cy="300" r="26" fill="none" stroke="url(#gold)" stroke-opacity="0.65" stroke-width="2.6"/>
<path d="M120 240 h220" stroke="#d4af37" stroke-opacity="0.35" stroke-width="1.6"/>'''


def users():
    parts = []
    for x, y, r in [(200, 180, 34), (320, 160, 40), (440, 184, 32), (260, 262, 36), (384, 266, 36)]:
        parts.append(
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.2"/>'
        )
        parts.append(
            f'<path d="M{x - r} {y + r + 52} q{r} -44 {2 * r} 0" fill="none" '
            f'stroke="#d4af37" stroke-opacity="0.45" stroke-width="2"/>'
        )
    return ''.join(parts)


def shield():
    return '''
<path d="M320 96 L470 150 v108 q0 92 -150 132 q-150 -40 -150 -132 V150z" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<path d="M266 214 l38 40 l76 -80" fill="none" stroke="url(#gold)" stroke-opacity="0.85" stroke-width="3.2" stroke-linecap="round"/>'''


def card():
    return '''
<rect x="150" y="150" width="340" height="200" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<path d="M150 210 h340" stroke="#d4af37" stroke-opacity="0.55" stroke-width="3"/>
<rect x="182" y="246" width="120" height="14" rx="7" fill="#ffffff" fill-opacity="0.12"/>
<rect x="182" y="278" width="72" height="14" rx="7" fill="#ffffff" fill-opacity="0.09"/>
<circle cx="430" cy="290" r="22" fill="none" stroke="url(#gold)" stroke-opacity="0.6" stroke-width="2"/>'''


def scroll():
    return '''
<rect x="176" y="120" width="288" height="220" rx="14" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<g stroke="#ffffff" stroke-opacity="0.16" stroke-width="2"><path d="M212 168h216M212 204h216M212 240h150M212 276h96"/></g>
<path d="M372 276 h56" stroke="url(#gold)" stroke-opacity="0.8" stroke-width="3"/>'''


def clipboard():
    return '''
<rect x="206" y="130" width="228" height="230" rx="14" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<rect x="266" y="112" width="108" height="38" rx="10" fill="none" stroke="#d4af37" stroke-opacity="0.6" stroke-width="2.2"/>
<path d="M248 232 l32 34 l74 -78" fill="none" stroke="url(#gold)" stroke-opacity="0.85" stroke-width="3.4" stroke-linecap="round"/>'''


def parts():
    out = [
        '<circle cx="268" cy="196" r="58" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>',
        '<circle cx="268" cy="196" r="22" fill="none" stroke="#d4af37" stroke-opacity="0.55" stroke-width="2"/>',
    ]
    for i in range(8):
        a = math.radians(i * 45)
        out.append(
            f'<line x1="{268 + 58 * math.cos(a):.1f}" y1="{196 + 58 * math.sin(a):.1f}" '
            f'x2="{268 + 76 * math.cos(a):.1f}" y2="{196 + 76 * math.sin(a):.1f}" '
            f'stroke="#d4af37" stroke-opacity="0.5" stroke-width="6"/>'
        )
    out.append(
        '<path d="M372 168 l86 46 v92 l-86 46 l-86 -46 v-92z" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.2"/>'
    )
    out.append(
        '<path d="M286 214 l86 46 l86 -46 M372 260 v92" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.6"/>'
    )
    return ''.join(out)


def settings_art():
    return '''
<g stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4">
  <path d="M180 160 h280M180 230 h280M180 300 h280"/>
</g>
<circle cx="250" cy="160" r="18" fill="none" stroke="url(#gold)" stroke-opacity="0.75" stroke-width="2.6"/>
<circle cx="400" cy="230" r="18" fill="none" stroke="url(#gold)" stroke-opacity="0.75" stroke-width="2.6"/>
<circle cx="300" cy="300" r="18" fill="none" stroke="url(#gold)" stroke-opacity="0.75" stroke-width="2.6"/>'''


def globe():
    return '''
<circle cx="320" cy="210" r="118" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<ellipse cx="320" cy="210" rx="48" ry="118" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.6"/>
<path d="M204 210 h232 M224 156 h192 M224 264 h192" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.6"/>
<path d="M204 210 h232" stroke="url(#gold)" stroke-opacity="0.5" stroke-width="2"/>'''


def phone():
    return '''
<rect x="248" y="96" width="144" height="248" rx="24" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<rect x="272" y="150" width="96" height="60" rx="10" fill="none" stroke="#d4af37" stroke-opacity="0.5" stroke-width="2"/>
<g stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"><path d="M272 240h96M272 272h64"/></g>
<path d="M304 120 h32" stroke="#ffffff" stroke-opacity="0.3" stroke-width="3" stroke-linecap="round"/>'''


def operations():
    return '''
<circle cx="320" cy="210" r="104" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2"/>
<circle cx="320" cy="210" r="62" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>
<path d="M320 106 v40 M320 274 v40 M216 210 h40 M384 210 h40" stroke="url(#gold)" stroke-opacity="0.7" stroke-width="3"/>
<path d="M320 210 L392 158" stroke="#d4af37" stroke-opacity="0.8" stroke-width="3.2" stroke-linecap="round"/>
<circle cx="320" cy="210" r="8" fill="#d4af37" fill-opacity="0.9"/>'''


def crm():
    return '''
<circle cx="230" cy="180" r="46" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<circle cx="412" cy="180" r="46" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<path d="M276 180 h90" stroke="url(#gold)" stroke-opacity="0.7" stroke-width="2.6" stroke-dasharray="8 8"/>
<path d="M230 226 q0 40 46 48 M412 226 q0 40 -46 48" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>
<path d="M320 288 q-52 0 -52 -34 q0 -34 52 -34 q52 0 52 34 q0 34 -52 34z" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2"/>'''


def permissions():
    """Roles-and-permissions motif: a keyed lock over a granted-access list.

    Distinct from `users()` (a group of people) so the Users & Permissions card
    does not share the Human Resources visual.
    """
    return '''
<rect x="204" y="196" width="152" height="126" rx="16" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<path d="M232 196 v-34 q0 -44 48 -44 q48 0 48 44 v34" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<circle cx="280" cy="250" r="17" fill="none" stroke="url(#gold)" stroke-opacity="0.85" stroke-width="2.8"/>
<path d="M280 267 v26" stroke="url(#gold)" stroke-opacity="0.85" stroke-width="3.2" stroke-linecap="round"/>
<g stroke="#d4af37" stroke-opacity="0.5" stroke-width="2.2">
  <path d="M404 214 h58 M404 250 h58 M404 286 h34"/>
</g>
<g stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.6">
  <path d="M398 206 v16 M398 242 v16 M398 278 v16"/>
</g>'''


def booking():
    """Calendar motif: a month grid with a highlighted confirmed slot."""
    slots = []
    for row in range(3):
        for col in range(4):
            x = 236 + col * 46
            y = 202 + row * 40
            filled = row == 1 and col == 2
            if filled:
                slots.append(f'<rect x="{x}" y="{y}" width="30" height="28" rx="6" fill="url(#gold)" fill-opacity="0.85"/>')
            else:
                slots.append(
                    f'<rect x="{x}" y="{y}" width="30" height="28" rx="6" fill="none" '
                    f'stroke="#ffffff" stroke-opacity="0.16" stroke-width="1.6"/>'
                )
    return (
        '<rect x="204" y="140" width="232" height="196" rx="16" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>'
        '<path d="M204 190 h232" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.8"/>'
        '<path d="M256 122 v34 M384 122 v34" stroke="#d4af37" stroke-opacity="0.6" stroke-width="4" stroke-linecap="round"/>'
        + ''.join(slots)
    )


def provider():
    """Provider-portal motif: a storefront with an approval tick."""
    return '''
<path d="M188 216 h264 v128 h-264z" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<path d="M170 216 l26 -62 h248 l26 62z" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<path d="M206 216 v128 M434 216 v128" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1.6"/>
<rect x="290" y="262" width="60" height="82" rx="8" fill="none" stroke="#d4af37" stroke-opacity="0.55" stroke-width="2"/>
<circle cx="466" cy="180" r="34" fill="#001a33" stroke="url(#gold)" stroke-opacity="0.85" stroke-width="2.8"/>
<path d="M450 180 l12 13 l24 -26" fill="none" stroke="url(#gold)" stroke-opacity="0.9" stroke-width="3.2" stroke-linecap="round"/>'''


def payments():
    """Payments motif: a terminal card with a settled gold transaction line."""
    return '''
<rect x="182" y="158" width="276" height="172" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.4"/>
<path d="M182 214 h276" stroke="#d4af37" stroke-opacity="0.6" stroke-width="3"/>
<rect x="212" y="244" width="66" height="48" rx="8" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>
<g stroke="#ffffff" stroke-opacity="0.14" stroke-width="2">
  <path d="M304 252 h124 M304 280 h88"/>
</g>
<circle cx="466" cy="300" r="42" fill="#001a33" stroke="url(#gold)" stroke-opacity="0.8" stroke-width="3"/>
<path d="M450 300 l11 12 l22 -24" fill="none" stroke="url(#gold)" stroke-opacity="0.9" stroke-width="3.2" stroke-linecap="round"/>'''


ASSETS = {
    'tile-company': building(),
    'tile-branch': pin(),
    'tile-accounting': chart('line'),
    'tile-sales': chart('bars'),
    'tile-purchasing': truck(),
    'tile-warehouse': warehouse(),
    'tile-hr': users(),
    'tile-crm': crm(),
    'tile-operations': operations(),
    'tile-inspection': clipboard(),
    'tile-maintenance': gear(),
    'tile-parts': parts(),
    'tile-reports': chart('donut'),
    'tile-users': permissions(),
    'tile-booking': booking(),
    'tile-provider': provider(),
    'tile-payments': payments(),
    'tile-subscription': card(),
    'tile-settings': settings_art(),
    'tile-website': globe(),
    'tile-app': phone(),
    'tile-audit': scroll(),
    'tile-support': shield(),
    'tile-modules': gear(),
    'tile-plans': card(),
    'tile-dashboard': dashboard(),
}


def main():
    for name, inner in ASSETS.items():
        wrap(name, grid() + inner)
    wrap('dashboard-hero', hero())
    wrap('automotive-hero', car())
    print(f'generated {len(ASSETS) + 2} svg assets in {os.path.abspath(OUT)}')


if __name__ == '__main__':
    main()
