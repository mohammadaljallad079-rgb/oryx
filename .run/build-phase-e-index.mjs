/**
 * Builds a self-contained HTML index of the Phase E light-theme evidence.
 *
 * Groups the five customer surfaces with the light/dark pairs, the four
 * approved design references and the dark-regression verdict, and copies the
 * screenshots into the servable evidence root so the preview proxy can serve
 * them. Run with: node .run/build-phase-e-index.mjs
 */
import { readdirSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = '/workspace/project/oryx';
const SRC = `${ROOT}/docs/audit/exec07/phase-e/after`;
const BEFORE = `${ROOT}/docs/audit/exec07/phase-e/before`;
const REF = `${ROOT}/.run/evidence/ref`;
const OUT_DIR = `${ROOT}/.run/evidence/exec07-phase-e`;

const manifest = JSON.parse(readFileSync(`${SRC}/manifest.json`, 'utf8'));
const byName = new Map(manifest.map((m) => [`${m.route}|${m.width}|${m.locale}|${m.theme}`, m]));

mkdirSync(OUT_DIR, { recursive: true });
for (const f of readdirSync(SRC)) if (f.endsWith('.png')) copyFileSync(`${SRC}/${f}`, `${OUT_DIR}/${f}`);
if (existsSync(BEFORE)) {
  mkdirSync(`${OUT_DIR}/before`, { recursive: true });
  for (const f of readdirSync(BEFORE)) if (f.endsWith('.png')) copyFileSync(`${BEFORE}/${f}`, `${OUT_DIR}/before/${f}`);
}

const SURFACES = [
  ['/', 'homepage', 'Homepage'],
  ['/dashboard', 'dashboard', 'Customer dashboard'],
  ['/providers', 'providers', 'Provider directory'],
  ['/login', 'login', 'Sign in'],
  ['/profile', 'profile', 'Customer profile'],
];
const WIDTHS = ['desktop', 'tablet', 'mobile'];
const LOCALES = ['ar', 'en'];

const fig = (src, caption) =>
  `<figure><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${caption}" loading="lazy" /></a><figcaption>${caption}</figcaption></figure>`;

const sections = [];
for (const [route, slug, label] of SURFACES) {
  const rows = [];
  for (const width of WIDTHS) {
    for (const locale of LOCALES) {
      const l = `${slug}-${width}-${locale}-light.png`;
      const d = `${slug}-${width}-${locale}-dark.png`;
      const meta = byName.get(`${route}|${width}|${locale}|light`);
      if (!existsSync(`${OUT_DIR}/${l}`)) continue;
      rows.push(`
        <div class="pair">
          <div class="pair-head">${width} · ${locale.toUpperCase()} · contrast ${meta?.contrast ?? '—'} · overflow ${meta?.overflow ?? '—'}px</div>
          <div class="pair-grid">
            ${fig(l, 'light')}
            ${existsSync(`${OUT_DIR}/${d}`) ? fig(d, 'dark') : ''}
          </div>
        </div>`);
    }
  }
  sections.push(`<section><h2>${label} <code>${route}</code></h2><div class="pairs">${rows.join('')}</div></section>`);
}

const refs = ['ref-home.jpg', 'ref-dash.jpg', 'ref-logo.png']
  .filter((f) => existsSync(`${REF}/${f}`))
  .map((f) => {
    copyFileSync(`${REF}/${f}`, `${OUT_DIR}/${f}`);
    return fig(f, `approved reference — ${f}`);
  })
  .join('');

const PAIRS = `${ROOT}/docs/audit/exec07/phase-e/comparisons-after`;
const comparison = ['01-homepage', '02-dashboard', '03-providers', '04-login', '06-profile']
  .flatMap((slug) =>
    LOCALES.map((locale) => {
      const name = `${slug}-desktop-${locale}-light-vs-dark.jpg`;
      if (!existsSync(`${PAIRS}/${name}`)) return '';
      copyFileSync(`${PAIRS}/${name}`, `${OUT_DIR}/${name}`);
      return fig(name, `light vs dark — ${slug.replace(/^\d+-/, '')} (${locale.toUpperCase()}, desktop)`);
    }),
  )
  .join('');

// Measured verdicts, read from the JSON the verifiers write rather than
// restated by hand, so the index cannot drift from the evidence.
const dark = JSON.parse(readFileSync(`${SRC}/dark-invariance.json`, 'utf8'));
const palette = JSON.parse(readFileSync(`${ROOT}/docs/audit/exec07/phase-e/light-theme-audit.json`, 'utf8'));
const palettePairs = Object.values(palette).flatMap((surface) => Object.values(surface));
// WCAG applies to text and icons, so containers with no own text (a hero shell,
// a card frame) are excluded; the audit records their resolved colour but their
// ratio describes the panel, not a glyph.
const textPairs = palettePairs.filter((p) => p.ownText.trim() !== '' || p.isIcon);
const belowThreshold = textPairs.filter((p) => p.contrast < p.threshold).length;
const verdict = `
<section><h2>Measured verdict</h2>
  <div class="stats">
    <div class="stat"><b>${dark.themeChromeMoved}</b><span>dark captures whose theme chrome moved</span></div>
    <div class="stat"><b>${dark.contentOnlyDelta}</b><span>dark captures whose delta is content only</span></div>
    <div class="stat"><b>${dark.byteIdenticalWholeFrame}/${dark.captures}</b><span>dark captures byte-identical whole-frame</span></div>
    <div class="stat"><b>${textPairs.length - belowThreshold}/${textPairs.length}</b><span>light text pairs at or above WCAG</span></div>
    <div class="stat"><b>${belowThreshold}</b><span>light text pairs below WCAG</span></div>
  </div>
  <p class="lede">The dark theme is compared against the pre-change captures of the same routes and
  viewports. A whole-frame difference cannot on its own mean the theme moved, because the two sets were
  captured at different commits and the same-origin fix let the CMS photography load for the first time.
  The header chrome band is painted by the theme token layer and carries no photograph, so it is the
  witness: <b>${dark.themeChromeMoved}</b> of ${dark.captures} captures moved it. The remaining
  ${dark.contentOnlyDelta} deltas are the loaded photography. The light theme is measured by resolved
  colour against WCAG 2.1, not by eye. See §16 of the Phase E report.</p>
</section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ORYX — Execution 07 Phase E light theme</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px 24px 64px; background:#00162b; color:#e8edf4;
    font:15px/1.6 system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  header,section,footer { max-width:1500px; margin:0 auto 40px; }
  h1 { font-size:26px; margin:0 0 8px; }
  h2 { font-size:19px; margin:0 0 14px; }
  h2 code { color:#e8c766; font-size:14px; font-weight:500; }
  .lede { color:#9fb2c8; max-width:78ch; margin:0; }
  .stats { display:flex; gap:20px; flex-wrap:wrap; margin-top:20px; }
  .stat { padding:12px 18px; border-radius:12px; background:#0b2439; border:1px solid #1d3a55; }
  .stat b { display:block; font-size:22px; color:#e8c766; }
  .stat span { font-size:11px; color:#9fb2c8; text-transform:uppercase; letter-spacing:.08em; }
  .pairs { display:grid; gap:22px; }
  .pair-head { font-size:12px; color:#7f95ad; margin-bottom:8px; text-transform:uppercase; letter-spacing:.06em; }
  .pair-grid { display:grid; gap:14px; grid-template-columns:1fr 1fr; }
  .ref-grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); }
  figure { margin:0; }
  img { width:100%; display:block; border-radius:10px; border:1px solid #1d3a55; background:#0b2439; }
  figcaption { font-size:12px; color:#7f95ad; margin-top:6px; text-transform:capitalize; }
  @media (max-width:900px){ .pair-grid { grid-template-columns:1fr; } }
</style></head><body>
<header>
  <h1>ORYX — Execution 07 Phase E: light theme</h1>
  <p class="lede">Real renders of the running customer site over the preview proxy. Every surface is
  shown in the light theme beside the dark theme it must not disturb, at desktop (1440),
  tablet (834) and mobile (390) widths, in Arabic RTL and English LTR.</p>
  <div class="stats">
    <div class="stat"><b>${manifest.length}</b><span>captures</span></div>
    <div class="stat"><b>${SURFACES.length}</b><span>surfaces</span></div>
    <div class="stat"><b>${manifest.filter((m) => m.theme === 'light' && m.overflow > 1).length}</b><span>light overflow defects</span></div>
    <div class="stat"><b>${manifest.filter((m) => m.status >= 400).length}</b><span>non-200</span></div>
    <div class="stat"><b>14.79:1</b><span>light body contrast</span></div>
  </div>
</header>
${sections.join('\n')}
${verdict}
<section><h2>Light vs dark comparison</h2><div class="ref-grid">${comparison}</div></section>
<section><h2>Approved references</h2><div class="ref-grid">${refs}</div></section>
<footer>Generated by <code>.run/build-phase-e-index.mjs</code> from
<code>docs/audit/exec07/phase-e/after/manifest.json</code>.</footer>
</body></html>`;

writeFileSync(`${OUT_DIR}/index.html`, html);
console.log(`wrote ${OUT_DIR}/index.html (${sections.length} surfaces, ${manifest.length} captures)`);
