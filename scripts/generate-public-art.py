"""Generate original vector artwork for the ORYX public website.

Same visual language as the admin dashboard tiles (deep navy ground, restrained
gold line art, faint technical grid) so the public site and the platform read as
one brand — but each service category gets its *own* motif, because the audit
found all five categories previously shared a single generic gradient.

No stock photography, no third-party marks, no reuse of the approved dashboard
reference as artwork. Pure generated geometry.

Run: python3 scripts/generate-public-art.py
"""

import math
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'apps', 'customer', 'public', 'art')
os.makedirs(OUT, exist_ok=True)

W, H = 720, 480


def wrap(name, inner, w=W, h=H):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice" role="img">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#05233f"/>
    <stop offset="52%" stop-color="#001a33"/>
    <stop offset="100%" stop-color="#000b18"/>
  </linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#e8c766"/>
    <stop offset="100%" stop-color="#a9861f"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.8" cy="0.1" r="0.9">
    <stop offset="0%" stop-color="#d4af37" stop-opacity="0.28"/>
    <stop offset="100%" stop-color="#d4af37" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="cool" cx="0.12" cy="0.9" r="0.8">
    <stop offset="0%" stop-color="#4aa8ff" stop-opacity="0.16"/>
    <stop offset="100%" stop-color="#4aa8ff" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="{w}" height="{h}" fill="url(#bg)"/>
<rect width="{w}" height="{h}" fill="url(#glow)"/>
<rect width="{w}" height="{h}" fill="url(#cool)"/>
{inner}
</svg>'''
    with open(os.path.join(OUT, f'{name}.svg'), 'w', encoding='utf-8') as fh:
        fh.write(svg)


def grid(w=W, h=H, step=36):
    parts = []
    for x in range(0, w, step):
        parts.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{h}" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>')
    for y in range(0, h, step):
        parts.append(f'<line x1="0" y1="{y}" x2="{w}" y2="{y}" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>')
    return ''.join(parts)


# ------------------------------------------------------------------ hero
def hero():
    """Wide hero ground: a stylised vehicle silhouette under a gold horizon."""
    return grid(W, H, 40) + '''
<circle cx="592" cy="150" r="150" fill="none" stroke="url(#gold)" stroke-opacity="0.4" stroke-width="1.6"/>
<circle cx="592" cy="150" r="110" fill="none" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1.2"/>
<circle cx="592" cy="150" r="34" fill="none" stroke="url(#gold)" stroke-opacity="0.65" stroke-width="2"/>
<path d="M40 392 q90 -118 250 -122 h230 q96 2 150 74 l22 48" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2.4"/>
<path d="M132 392 q34 -74 118 -78 l120 -6 q72 -4 116 52 l24 32" fill="none" stroke="url(#gold)" stroke-opacity="0.5" stroke-width="2"/>
<path d="M250 322 l40 -60 h96 l30 60" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.8"/>
<circle cx="238" cy="392" r="42" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="3.2"/>
<circle cx="238" cy="392" r="17" fill="none" stroke="url(#gold)" stroke-opacity="0.6" stroke-width="2.4"/>
<circle cx="556" cy="392" r="42" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="3.2"/>
<circle cx="556" cy="392" r="17" fill="none" stroke="url(#gold)" stroke-opacity="0.6" stroke-width="2.4"/>
<path d="M0 430 h720" stroke="url(#gold)" stroke-opacity="0.32" stroke-width="1.6"/>
<path d="M64 118 h84 M64 118 v36 M148 118 v36" fill="none" stroke="#d4af37" stroke-opacity="0.45" stroke-width="1.2"/>'''


# ------------------------------------------- service category motifs
def maintenance():
    """Wrench over a gear — mechanical service and repair."""
    teeth = []
    for i in range(12):
        a = math.radians(i * 30)
        x1, y1 = 360 + 96 * math.cos(a), 250 + 96 * math.sin(a)
        x2, y2 = 360 + 124 * math.cos(a), 250 + 124 * math.sin(a)
        teeth.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#d4af37" stroke-opacity="0.42" stroke-width="9"/>')
    return grid() + ''.join(teeth) + '''
<circle cx="360" cy="250" r="96" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2.4"/>
<circle cx="360" cy="250" r="42" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2.4"/>
<circle cx="360" cy="250" r="15" fill="none" stroke="url(#gold)" stroke-opacity="0.7" stroke-width="2.6"/>
<path d="M186 96 l54 54 a30 30 0 0 0 42 42 l30 30 -30 30 -30 -30 a30 30 0 0 1 -42 -42 l-54 -54 z" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2.4"/>
<path d="M198 108 l40 40" stroke="url(#gold)" stroke-opacity="0.6" stroke-width="3"/>'''


def inspection():
    """Clipboard with a verification tick — vehicle inspection."""
    return grid() + '''
<rect x="236" y="104" width="248" height="300" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.6"/>
<rect x="316" y="86" width="88" height="40" rx="12" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="2.6"/>
<path d="M282 196h60M282 250h120M282 304h84" stroke="#ffffff" stroke-opacity="0.16" stroke-width="3" stroke-linecap="round"/>
<circle cx="286" cy="196" r="9" fill="none" stroke="#d4af37" stroke-opacity="0.55" stroke-width="2"/>
<circle cx="286" cy="250" r="9" fill="none" stroke="#d4af37" stroke-opacity="0.55" stroke-width="2"/>
<circle cx="286" cy="304" r="9" fill="none" stroke="#d4af37" stroke-opacity="0.55" stroke-width="2"/>
<path d="M404 322 l34 36 l68 -78" fill="none" stroke="url(#gold)" stroke-opacity="0.85" stroke-width="4" stroke-linecap="round"/>'''


def tyres():
    """Tyre and battery — tyres, batteries and consumables."""
    return grid() + '''
<circle cx="268" cy="258" r="128" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="3"/>
<circle cx="268" cy="258" r="86" fill="none" stroke="#ffffff" stroke-opacity="0.13" stroke-width="2"/>
<circle cx="268" cy="258" r="34" fill="none" stroke="url(#gold)" stroke-opacity="0.65" stroke-width="2.6"/>
<g stroke="#d4af37" stroke-opacity="0.35" stroke-width="7">
  <path d="M268 130v40M268 346v40M140 258h40M356 258h40M178 168l28 28M330 320l28 28M358 168l-28 28M206 320l-28 28"/>
</g>
<rect x="452" y="196" width="180" height="124" rx="12" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2.6"/>
<path d="M500 196v-24h24v24M560 196v-24h24v24" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2.4"/>
<path d="M506 236 l-20 40 h30 l-14 40 46 -54 h-30 l18 -26z" fill="none" stroke="url(#gold)" stroke-opacity="0.8" stroke-width="2.8"/>'''


def bodywork():
    """Spray gun over a body panel — bodywork and paint."""
    return grid() + '''
<path d="M180 300 q60 -110 190 -112 q128 -2 176 96" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2.8"/>
<path d="M216 300 q54 -84 158 -86 q104 0 146 74" fill="none" stroke="url(#gold)" stroke-opacity="0.5" stroke-width="2"/>
<rect x="150" y="150" width="112" height="58" rx="12" fill="none" stroke="#ffffff" stroke-opacity="0.24" stroke-width="2.6"/>
<path d="M262 166 h44 v26 h-44z" fill="none" stroke="#ffffff" stroke-opacity="0.24" stroke-width="2.4"/>
<path d="M306 172 h34 v14 h-34z" fill="none" stroke="#d4af37" stroke-opacity="0.6" stroke-width="2.4"/>
<g stroke="url(#gold)" stroke-opacity="0.5" stroke-width="2" stroke-linecap="round">
  <path d="M360 150 l40 -22M368 172 l48 -4M360 194 l40 22"/>
</g>
<g fill="#d4af37" fill-opacity="0.5">
  <circle cx="416" cy="118" r="4"/><circle cx="440" cy="160" r="4"/><circle cx="416" cy="212" r="4"/>
</g>'''


def recovery():
    """Tow truck — roadside recovery and assistance."""
    return grid() + '''
<path d="M120 288 h212 v-70 h-92 l-52 -52 h-68z" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.6"/>
<path d="M332 236 h76 l64 66 v14 h-140z" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2.6"/>
<path d="M120 218 h64" stroke="#d4af37" stroke-opacity="0.4" stroke-width="2"/>
<path d="M118 176 l120 -74" stroke="url(#gold)" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"/>
<path d="M232 106 l34 -18 M240 130 l40 -22" stroke="#d4af37" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/>
<circle cx="196" cy="304" r="34" fill="none" stroke="url(#gold)" stroke-opacity="0.6" stroke-width="3"/>
<circle cx="452" cy="304" r="34" fill="none" stroke="url(#gold)" stroke-opacity="0.6" stroke-width="3"/>
<path d="M0 340 h720" stroke="url(#gold)" stroke-opacity="0.3" stroke-width="1.6"/>'''


for name, fn in [
    ('hero-automotive', hero),
    ('service-maintenance', maintenance),
    ('service-inspection', inspection),
    ('service-tyres', tyres),
    ('service-bodywork', bodywork),
    ('service-recovery', recovery),
]:
    fn_art = fn()
    wrap(name, fn_art)

print(f'wrote {len(os.listdir(OUT))} files to {OUT}')
