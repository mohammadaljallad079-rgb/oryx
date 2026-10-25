#!/usr/bin/env node
/**
 * Builds the permanent, GitHub-hosted ORYX design preview.
 *
 * Everything this site publishes is already committed in the repository: the
 * audit reports, the Phase E before/after captures, the light-vs-dark
 * comparison sheets and the approved brand assets. The build copies those
 * assets into a self-contained static site (no runtime JavaScript, no network
 * call) and renders the reports to HTML, so the published URL is a stable
 * mirror of the repository and dies only when the branch does.
 *
 * Output: build/preview/
 *   index.html                 overview, brand, what changed, how to view
 *   reports/*.html             every committed report, rendered
 *   evidence/*.html            the five surfaces, before/after, light vs dark
 *   brand/*.html               logo and approved references
 *   assets/**                  copied images (downscaled where useful)
 *   assets/site.css            stylesheet
 *   assets/logo.png            normalised logo for the header
 *
 * Run: node scripts/preview/build-preview.mjs
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, escapeHtml, slugify } from './markdown.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'build', 'preview');
const ASSETS = path.join(OUT, 'assets');

/**
 * The generated site is a superset of the exported ORYX website.
 *
 *   /                     the real customer website (Next.js static export)
 *   /evidence/            Phase E before/after captures and comparison sheets
 *   /reports/             every committed audit report, rendered to HTML
 *   /brand/               the approved logo and design references
 *
 * The website is the root document, so the published URL opens the actual
 * product rather than an index of documents. The evidence and reports keep
 * their own prefixes and never shadow a site route: the build asserts that
 * before it writes anything.
 */
const EVIDENCE = path.join(OUT, 'evidence');
const REPORTS = path.join(OUT, 'reports');
const BRAND = path.join(OUT, 'brand');
/** The exported Next.js site, produced into `apps/customer/out`. */
const SITE_SRC = path.join(ROOT, 'apps', 'customer', 'out');
/** Prefix the evidence/report pages use to reach the site's own assets. */
const ASSET_PREFIX = '../assets/';

const REPO = 'https://github.com/mohammadaljallad079-rgb/oryx';
const BRANCH = process.env.PREVIEW_BRANCH || 'feature/execution-07-premium-web';
const SHA = process.env.PREVIEW_SHA || '';
const SHORT = SHA ? SHA.slice(0, 7) : 'local';
const BUILT_AT = process.env.PREVIEW_BUILT_AT || new Date().toISOString();

// --------------------------------------------------------------------- utils
const rel = (...p) => path.join(ROOT, ...p);
const exists = (p) => existsSync(rel(p));

function read(p) {
  return readFileSync(rel(p), 'utf8');
}

function write(relPath, contents) {
  const full = path.join(OUT, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function copyFile(from, toRel) {
  const target = path.join(OUT, toRel);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(rel(from), target);
}

function listFiles(dir, exts) {
  const full = rel(dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => exts.some((e) => f.toLowerCase().endsWith(e)))
    .filter((f) => statSync(path.join(full, f)).isFile())
    .sort();
}

/** Count the HTML documents under a directory, recursively. */
function countHtml(dir) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countHtml(path.join(dir, entry.name));
    else if (entry.name.endsWith('.html')) n += 1;
  }
  return n;
}

/**
 * Page shell shared by every generated page.
 *
 * Every page this script writes lives exactly one directory below the site
 * root (`/evidence/`, `/reports/`, `/brand/`, `/overview/`), so a single `../`
 * reaches both the site's assets and the website itself. Keeping that uniform
 * removes a class of broken-link bugs: there is no depth to get wrong.
 */
function page({ title, description, body, current = '' }) {
  const up = '../';
  const nav = [
    ['', 'The website'],
    ['overview/', 'Overview'],
    ['evidence/', 'Design evidence'],
    ['reports/', 'Reports'],
    ['brand/', 'Brand'],
  ]
    .map(([href, label]) => {
      const active = current === href.replace('/', '') ? ' aria-current="page"' : '';
      return `<a href="${up}${href}"${active}>${label}</a>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)} · ORYX design preview</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="icon" href="${up}assets/logo.png" />
<link rel="stylesheet" href="${up}assets/site.css" />
</head>
<body>
<header class="site-header">
  <div class="site-header__inner">
    <a class="brand" href="${up}">
      <img src="${up}assets/logo.png" alt="ORYX" />
      <span>ORYX<span class="brand__sub">Design preview · not production</span></span>
    </a>
    <nav class="site-nav">${nav}</nav>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="site-footer__inner">
    <span>Static design preview generated from the <code>${escapeHtml(BRANCH)}</code> branch at <code>${escapeHtml(SHORT)}</code>.</span>
    <span>Source of truth: <a href="${REPO}/tree/${encodeURIComponent(BRANCH)}">the repository</a> · built ${escapeHtml(BUILT_AT)}</span>
  </div>
</footer>
</body>
</html>
`;
}

function figure(src, caption, alt, prefix = '') {
  return `<figure><a href="${prefix}${src}" target="_blank" rel="noopener"><img src="${prefix}${src}" alt="${escapeHtml(alt ?? caption)}" loading="lazy" /></a><figcaption>${caption}</figcaption></figure>`;
}

// ------------------------------------------------------------------ reset
rmSync(OUT, { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });

// ------------------------------------------------------- the ORYX website
// The exported customer site is the root of the published URL. It is built by
// `next build` in `apps/customer` with `ORYX_STATIC_EXPORT=1`, which writes
// `apps/customer/out`. A missing export is a hard failure: publishing a
// documentation index in its place is exactly the outcome the owner rejected.
if (!existsSync(SITE_SRC)) {
  console.error(
    'preview: apps/customer/out is missing.\n' +
      'preview: build the website first:\n' +
      'preview:   ORYX_STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/oryx pnpm --filter @oryx/customer build',
  );
  process.exit(1);
}
if (!existsSync(path.join(SITE_SRC, 'index.html'))) {
  console.error('preview: apps/customer/out/index.html is missing; the export is incomplete.');
  process.exit(1);
}

cpSync(SITE_SRC, OUT, { recursive: true });

// The evidence, report and brand directories must never shadow a real site
// route, or a page of the website would be replaced by a document.
for (const reserved of ['evidence', 'reports', 'brand', 'overview']) {
  if (existsSync(path.join(OUT, reserved, 'index.html')) && reserved !== 'overview') {
    // `evidence` and `brand` do not exist in the app; a collision means the
    // site grew a route with the same name and the two would fight.
    console.error(
      `preview: the website already serves /${reserved}/ — rename the document section before publishing.`,
    );
    process.exit(1);
  }
}

// The site's own bundled assets are what the evidence pages link to.
mkdirSync(ASSETS, { recursive: true });

// ----------------------------------------------------------- brand assets
// The header logo is normalised to a small PNG so every page loads it quickly.
copyFile('scripts/preview/site.css', 'assets/site.css');

let logoOk = false;
try {
  const sharp = (await import('sharp')).default;
  await sharp(rel('docs/assets/logo.png.jpeg'))
    .resize({ width: 220, withoutEnlargement: true })
    .png()
    .toFile(path.join(ASSETS, 'logo.png'));
  logoOk = true;
} catch (error) {
  // A logo that cannot be normalised must not fail the whole build; fall back
  // to the raw asset and report it on the overview page instead.
  console.warn(`preview: logo normalisation skipped (${error.message})`);
}
if (!logoOk && exists('docs/assets/logo.png.jpeg')) {
  copyFile('docs/assets/logo.png.jpeg', 'assets/logo.png');
}

// ------------------------------------------------------------------- favicon
if (!existsSync(path.join(ASSETS, 'logo.png')) && exists('docs/assets/logo.png.jpeg')) {
  copyFile('docs/assets/logo.png.jpeg', 'assets/logo.png');
}

// -------------------------------------------------------------- thumbnailer
let sharpLib = null;
try {
  sharpLib = (await import('sharp')).default;
} catch {
  sharpLib = null;
}

const thumbsMade = [];
/**
 * Writes a downscaled image and returns its site-relative path.
 *
 * `outBase` is the target path without an extension: the extension is chosen
 * here so a build without `sharp` still produces correctly-labelled files
 * rather than a PNG named `.webp`.
 */
async function makeThumb(srcRel, outBase, width = 900) {
  const ext = sharpLib ? '.webp' : path.extname(srcRel).toLowerCase();
  const outRel = `${outBase}${ext}`;
  const target = path.join(OUT, outRel);
  mkdirSync(path.dirname(target), { recursive: true });
  if (sharpLib) {
    await sharpLib(rel(srcRel)).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(target);
  } else {
    cpSync(rel(srcRel), target);
  }
  thumbsMade.push(outRel);
  return outRel;
}

// ======================================================================
// Design evidence
// ======================================================================
const PHASE_E_SURFACES = [
  ['01', 'homepage', 'Homepage', '/'],
  ['02', 'dashboard', 'Customer dashboard', '/dashboard'],
  ['03', 'providers', 'Provider directory', '/providers'],
  ['04', 'login', 'Sign in', '/login'],
  ['06', 'profile', 'Customer profile', '/profile'],
];
const WIDTHS = ['desktop', 'tablet', 'mobile'];
const LOCALES = ['ar', 'en'];

async function buildEvidencePages() {
  const afterManifest = exists('docs/audit/exec07/phase-e/after/manifest.json')
    ? JSON.parse(read('docs/audit/exec07/phase-e/after/manifest.json'))
    : [];
  const beforeManifest = exists('docs/audit/exec07/phase-e/before/manifest.json')
    ? JSON.parse(read('docs/audit/exec07/phase-e/before/manifest.json'))
    : [];
  const darkVerdict = exists('docs/audit/exec07/phase-e/after/dark-invariance.json')
    ? JSON.parse(read('docs/audit/exec07/phase-e/after/dark-invariance.json'))
    : null;

  const metaFor = (manifest, route, width, locale, theme) =>
    manifest.find((m) => m.route === route && m.width === width && m.locale === locale && m.theme === theme);

  let copied = 0;
  const sections = [];
  // A surface whose captures are missing must fail the build rather than vanish
  // from the page, so a numbering change in the capture script is caught here.
  const expected = [];
  const missing = [];

  for (const [num, slug, label, route] of PHASE_E_SURFACES) {
    const pairs = [];
    for (const width of WIDTHS) {
      for (const locale of LOCALES) {
        const lightSrc = `docs/audit/exec07/phase-e/after/${num}-${slug}-${width}-${locale}-light.png`;
        const darkSrc = `docs/audit/exec07/phase-e/after/${num}-${slug}-${width}-${locale}-dark.png`;
        const beforeLight = `docs/audit/exec07/phase-e/before/${num}-${slug}-${width}-${locale}-light.png`;
        expected.push(lightSrc);
        if (!exists(lightSrc)) {
          missing.push(lightSrc);
          continue;
        }

        const light = await makeThumb(lightSrc, `assets/evidence/after-${slug}-${width}-${locale}-light`);
        const dark = exists(darkSrc)
          ? await makeThumb(darkSrc, `assets/evidence/after-${slug}-${width}-${locale}-dark`)
          : null;
        const before = exists(beforeLight)
          ? await makeThumb(beforeLight, `assets/evidence/before-${slug}-${width}-${locale}-light`)
          : null;
        copied += 1;

        const m = metaFor(afterManifest, route, width, locale, 'light');
        const contrast = m?.contrast != null ? `contrast ${m.contrast}:1` : 'contrast —';
        const overflow = m?.overflow != null ? `overflow ${m.overflow}px` : '';
        const bg = m?.bodyBackground ?? '';
        const accent = m?.accent ?? '';

        pairs.push(`
        <div class="pair">
          <div class="pair__head">
            <span class="badge badge--info">${width} · ${locale.toUpperCase()}</span>
            <span>${contrast}</span>${overflow ? `<span>${overflow}</span>` : ''}
            ${bg ? `<span class="badge">bg ${escapeHtml(bg)}</span>` : ''}
            ${accent ? `<span class="badge badge--ok">accent ${escapeHtml(accent)}</span>` : ''}
          </div>
          <div class="pair__grid">
            ${figure(light, '<strong>Light</strong> — Phase E', `${label} ${width} ${locale} light`, '../')}
            ${dark ? figure(dark, '<strong>Dark</strong> — must not change', `${label} ${width} ${locale} dark`, '../') : ''}
            ${before ? figure(before, 'Light <strong>before</strong> Phase E', `${label} ${width} ${locale} light before`, '../') : ''}
          </div>
        </div>`);
      }
    }
    sections.push(`
      <section>
        <div class="section-head">
          <h2>${escapeHtml(label)}</h2>
          <p><code>${escapeHtml(route)}</code></p>
        </div>
        ${pairs.join('')}
      </section>`);
  }

  // Light-vs-dark comparison sheets, plus the raw full-page comparison pair the
  // capture script writes alongside them.
  const sheetFiles = listFiles('docs/audit/exec07/phase-e/comparisons-after', ['.jpg', '.jpeg', '.png']);
  const rawComparison = listFiles('docs/audit/exec07/phase-e/after', ['.png'])
    .filter((f) => f.startsWith('05-comparison-'));
  const sheets = [];
  for (const f of [...rawComparison.map((f) => `docs/audit/exec07/phase-e/after/${f}`), ...sheetFiles.map((f) => `docs/audit/exec07/phase-e/comparisons-after/${f}`)]) {
    const base = path.basename(f).replace(/\.(jpg|jpeg|png)$/i, '');
    const out = await makeThumb(f, `assets/evidence/comparison-${base}`, 1200);
    sheets.push(figure(out, escapeHtml(base), `light vs dark comparison ${base}`, '../'));
  }

  // Execution 08 — the same four owner-facing surfaces, swept from the live
  // published preview across three viewports, both locales and both themes.
  const EXEC08_SURFACES = [
    ['homepage', 'Homepage', '/'],
    ['dashboard', 'Customer dashboard', '/dashboard'],
    ['providers', 'Provider directory', '/providers'],
    ['login', 'Sign in', '/login'],
  ];
  const exec08Dir = 'docs/execution-reports/exec08-preview';
  const exec08 = [];
  if (exists(exec08Dir)) {
    for (const [slug, label, route] of EXEC08_SURFACES) {
      const pairs = [];
      for (const width of WIDTHS) {
        for (const locale of LOCALES) {
          const lightSrc = `${exec08Dir}/${slug}-${width}-${locale}-light.png`;
          if (!exists(lightSrc)) continue;
          const light = await makeThumb(lightSrc, `assets/evidence/exec08-${slug}-${width}-${locale}-light`);
          const sheetSrc = `${exec08Dir}/comparisons/${slug}-${width}-${locale}.png`;
          const sheet = exists(sheetSrc)
            ? await makeThumb(sheetSrc, `assets/evidence/exec08-${slug}-${width}-${locale}-sheet`, 1400)
            : null;
          pairs.push(`
        <div class="pair">
          <div class="pair__head">
            <span class="badge badge--info">${width} · ${locale.toUpperCase()}</span>
            <span>live GitHub Pages</span>
          </div>
          <div class="pair__grid">
            ${figure(light, '<strong>Light</strong> — Execution 08', `${label} ${width} ${locale} light`, '../')}
            ${sheet ? figure(sheet, 'Light <strong>vs</strong> dark', `${label} ${width} ${locale} comparison`, '../') : ''}
          </div>
        </div>`);
        }
      }
      if (pairs.length) {
        exec08.push(`
      <section>
        <div class="section-head">
          <h2>${escapeHtml(label)}</h2>
          <p><code>${escapeHtml(route)}</code> · captured from the live preview</p>
        </div>
        ${pairs.join('')}
      </section>`);
      }
    }
  }

  // Execution 11 — the live light-theme verification, captured from the running
  // stack after the ivory correction. The dark render sits beside each surface
  // as the control: it is the approved theme and must not change.
  const EXEC11_DIR = 'docs/audit/exec11/light-theme';
  const EXEC11_SURFACES = [
    ['01-homepage', 'Homepage', '/'],
    ['02-dashboard', 'Customer dashboard', '/dashboard'],
    ['03-providers', 'Provider directory', '/providers'],
    ['04-login', 'Sign in', '/login'],
    ['05-admin-dashboard', 'Super Admin dashboard', 'admin /dashboard'],
  ];
  const exec11 = [];
  if (exists(EXEC11_DIR)) {
    for (const [slug, label, route] of EXEC11_SURFACES) {
      const pairs = [];
      for (const width of WIDTHS) {
        for (const locale of LOCALES) {
          const lightSrc = `${EXEC11_DIR}/${slug}-${width}-${locale}-light.png`;
          if (!exists(lightSrc)) continue;
          const light = await makeThumb(lightSrc, `assets/evidence/exec11-${slug}-${width}-${locale}-light`, 1200);
          const darkSrc = `${EXEC11_DIR}/${slug}-${width}-${locale}-dark.png`;
          const dark = exists(darkSrc)
            ? await makeThumb(darkSrc, `assets/evidence/exec11-${slug}-${width}-${locale}-dark`, 1200)
            : null;
          pairs.push(`
        <div class="pair">
          <div class="pair__head">
            <span class="badge badge--info">${width} · ${locale.toUpperCase()}</span>
            <span>Execution 11 · running stack</span>
          </div>
          <div class="pair__grid">
            ${figure(light, '<strong>Light</strong> — ivory identity', `${label} ${width} ${locale} light`, '../')}
            ${dark ? figure(dark, '<strong>Dark</strong> — unchanged control', `${label} ${width} ${locale} dark`, '../') : ''}
          </div>
        </div>`);
        }
      }
      if (pairs.length) {
        exec11.push(`
      <section>
        <div class="section-head">
          <h2>${escapeHtml(label)}</h2>
          <p><code>${escapeHtml(route)}</code> · light and dark, captured from the running stack</p>
        </div>
        ${pairs.join('')}
      </section>`);
      }
    }
  }
  const exec11Sheets = [];
  if (exists(EXEC11_DIR)) {
    for (const f of listFiles(EXEC11_DIR, ['.png']).filter((f) => f.startsWith('cmp-'))) {
      const out = await makeThumb(`${EXEC11_DIR}/${f}`, `assets/evidence/exec11-${f.replace(/\.png$/, '')}`, 1600);
      exec11Sheets.push(
        figure(out, escapeHtml(f.replace(/^cmp-/, '').replace(/\.png$/, '')), 'light vs dark', '../'),
      );
    }
  }

  const DARK_LABELS = {
    captures: 'dark captures compared',
    byteIdentical: 'byte-identical',
    realColourShift: 'real colour shifts',
    isolatedPixelDeviation: 'isolated pixel deviations',
  };
  const darkStats = darkVerdict
    ? Object.entries(DARK_LABELS)
        .filter(([k]) => darkVerdict[k] !== undefined)
        .map(
          ([k, label]) =>
            `<div class="kpi"><div class="kpi__value">${escapeHtml(String(darkVerdict[k]))}</div><div class="kpi__label">${escapeHtml(label)}</div></div>`,
        )
        .join('')
    : '';

  // Phase E continuation — the light-theme correction re-captured from the
  // running stack. Kept as its own section so the correction is reviewable
  // without disturbing the committed before/after record above.
  const continuationDir = 'docs/audit/exec07/phase-e-light';
  const continuation = [];
  if (exists(`${continuationDir}/manifest.json`)) {
    const contManifest = JSON.parse(read(`${continuationDir}/manifest.json`));
    for (const m of contManifest) {
      const out = await makeThumb(
        `${continuationDir}/${m.name}.png`,
        `assets/evidence/phase-e-light-${m.name}`,
        1200,
      );
      const caption = `${m.name} · ${m.locale.toUpperCase()} · ${m.viewport} · bg ${m.resolved.bg}`;
      continuation.push(figure(out, escapeHtml(caption), `${m.name} light theme capture`, '../'));
    }
  }

  // Captures of the published site itself, taken from the live URL. They live
  // in the repository like every other piece of evidence.
  const liveDir = 'docs/audit/exec07/preview';
  const liveCaptures = [];
  if (exists(liveDir)) {
    for (const f of listFiles(liveDir, ['.webp', '.png', '.jpg']).sort()) {
      const out = await makeThumb(`${liveDir}/${f}`, `assets/evidence/live-${f.replace(/\.[^.]+$/, '')}`, 1400);
      liveCaptures.push(figure(out, escapeHtml(f.replace(/\.(webp|png|jpg)$/i, '')), 'the published preview', '../'));
    }
  }

  const body = `
    <p class="eyebrow">Design evidence</p>
    <h1>Light-theme evidence, permanently hosted</h1>
    <p class="lede">Every surface the owner asked for, captured in Arabic RTL and English LTR at desktop, tablet and mobile, as before/after pairs with the dark render beside them. These images are committed in the repository under <code>docs/audit/exec07/phase-e/</code>; this page is a stable view of them.</p>
    <div class="notice">
      <strong>Dark theme is the control.</strong> The middle capture of each pair is the dark render. It is the approved theme and must not change; the before/after comparison is what proves it did not.
    </div>
    ${darkStats ? `<h2>Dark-invariance verdict</h2><div class="kpis">${darkStats}</div>` : ''}
    ${continuation.length ? `<section><div class="section-head"><h2>Phase E continuation — the corrected light theme</h2><p>homepage, customer dashboard, provider directory and sign-in, re-captured from the running stack</p></div><div class="gallery">${continuation.join('')}</div></section>` : ''}
    ${liveCaptures.length ? `<section><div class="section-head"><h2>The published preview</h2><p>captured from the live GitHub Pages URL</p></div><div class="gallery">${liveCaptures.join('')}</div></section>` : ''}
    ${sections.join('')}
    ${sheets.length ? `<section><div class="section-head"><h2>Light vs dark sheets</h2><p>side-by-side composites</p></div><div class="gallery">${sheets.join('')}</div></section>` : ''}
    ${exec08.length ? `<section><div class="section-head"><h2>Execution 08 — swept from the live preview</h2><p>light render and light-vs-dark sheet for every viewport and locale</p></div></section>${exec08.join('')}` : ''}
    ${exec11.length ? `<section><div class="section-head"><h2>Execution 11 — the light-theme correction, verified live</h2><p>captured from the running stack: Arabic RTL and English LTR at desktop, tablet and mobile, with the approved dark render as the control</p></div></section>${exec11.join('')}` : ''}
    ${exec11Sheets.length ? `<section><div class="section-head"><h2>Execution 11 — light vs dark sheets</h2><p>side-by-side composites, one per surface and locale</p></div><div class="gallery">${exec11Sheets.join('')}</div></section>` : ''}
    <p class="card__meta">${copied} capture pairs · before set from <code>docs/audit/exec07/phase-e/before/</code> · after set from <code>docs/audit/exec07/phase-e/after/</code> · Execution 11 set from <code>docs/audit/exec11/light-theme/</code></p>
  `;

  write('evidence/index.html', page({ title: 'Design evidence', description: 'Phase E light-theme captures: before, after, light vs dark.', body, current: 'evidence' }));

  if (missing.length) {
    throw new Error(
      `preview: ${missing.length} expected capture(s) are missing; the evidence page would be incomplete:\n  ${missing.slice(0, 8).join('\n  ')}`,
    );
  }

  return { captures: copied, sheets: sheets.length, darkVerdict };
}

// ======================================================================
// Reports
// ======================================================================
const REPORT_GROUPS = [
  {
    title: 'Execution 07 — the current execution',
    dir: 'docs/audit/exec07',
    files: [
      '00_PHASE_A_WEB_AUDIT.md',
      '01_EXECUTION_07_REPORT.md',
      '02_PHASE_C_PREMIUM_PAGES.md',
      '03_PHASE_D_PHOTOGRAPHY_AND_CATEGORY_FIX.md',
      '04_PHASE_E_LIGHT_THEME.md',
      '05_PERMANENT_PREVIEW.md',
    ],
  },
  {
    title: 'Audit',
    dir: 'docs/audit',
    files: [
      'README.md',
      '01_SPECIFICATION_PARITY_MATRIX.md',
      '02_FUNCTIONAL_AUDIT.md',
      '03_VISUAL_COMPARISON.md',
      '04_FIXED_DEFECTS.md',
      '05_INTEGRATION_READINESS.md',
      '06_TEST_AND_CI_RESULTS.md',
      '07_LIVE_PREVIEW_AND_CREDENTIALS.md',
      '08_VISUAL_IDENTITY_AND_PREVIEW_VERIFICATION.md',
    ],
  },
  {
    title: 'Execution reports',
    dir: 'docs/execution-reports',
    files: readdirSync(rel('docs/execution-reports'))
      .filter((f) => f.endsWith('.md'))
      .sort(),
  },
];

/** Every page a report may link to, so relative links resolve inside the site. */
const reportPageIndex = new Map();
for (const group of REPORT_GROUPS) {
  for (const f of group.files) {
    reportPageIndex.set(`${group.dir}/${f}`, `${slugify(f.replace(/\.md$/, ''))}.html`);
  }
}

/**
 * Rewrites a link inside a report to something that resolves on the published
 * site: another published report becomes a sibling page, and anything else
 * points at the repository, which is the source of truth.
 */
function makeLinkResolver(srcRel) {
  const srcDir = path.posix.dirname(srcRel);
  return (href) => {
    const [target, anchor = ''] = href.split('#');
    const suffix = anchor ? `#${anchor}` : '';
    if (!target) return `#${anchor}`;
    const abs = path.posix.normalize(path.posix.join(srcDir, target.replace(/^\.\//, '')));
    if (reportPageIndex.has(abs)) return `${reportPageIndex.get(abs)}${suffix}`;
    return `${REPO}/blob/${encodeURIComponent(BRANCH)}/${abs}${suffix}`;
  };
}

function buildReports() {
  const cards = [];
  let rendered = 0;

  for (const group of REPORT_GROUPS) {
    const items = [];
    for (const f of group.files) {
      const src = `${group.dir}/${f}`;
      if (!exists(src)) continue;
      const slug = slugify(f.replace(/\.md$/, ''));
      const markdown = read(src);
      const { html, headings } = renderMarkdown(markdown, { resolveLink: makeLinkResolver(src) });

      const titleMatch = markdown.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].replace(/`/g, '') : f.replace(/\.md$/, '');
      const toc = headings
        .filter((h) => h.level === 2)
        .map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text.replace(/`/g, ''))}</a></li>`)
        .join('');

      const body = `
        <p class="eyebrow">${escapeHtml(group.title)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="card__meta">Rendered from <code>${escapeHtml(src)}</code> at <code>${escapeHtml(SHORT)}</code>. <a href="${REPO}/blob/${encodeURIComponent(BRANCH)}/${src}">View the source on GitHub</a>.</p>
        ${toc ? `<nav class="card"><strong>Contents</strong><ul class="toc">${toc}</ul></nav>` : ''}
        <article>${html}</article>
      `;
      write(`reports/${slug}.html`, page({ title, description: title, body, current: 'reports' }));
      rendered += 1;
      items.push({ file: src, slug, title, size: markdown.length });
    }
    if (items.length) cards.push({ group: group.title, items });
  }

  const sections = cards
    .map(
      (c) => `
    <div class="section-head"><h2>${escapeHtml(c.group)}</h2><p>${c.items.length} documents</p></div>
    <div class="grid">
      ${c.items
        .map(
          (it) => `<a class="card card--link" href="${it.slug}.html"><h3>${escapeHtml(it.title)}</h3><div class="card__meta"><code>${escapeHtml(it.file)}</code> · ${(it.size / 1024).toFixed(1)} KB</div></a>`,
        )
        .join('')}
    </div>`,
    )
    .join('');

  const body = `
    <p class="eyebrow">Reports</p>
    <h1>Every committed report, rendered</h1>
    <p class="lede">The Markdown in the repository is the source of truth. These pages are rendered from it at build time so a reader can read the evidence without cloning the branch.</p>
    ${sections}
  `;
  write('reports/index.html', page({ title: 'Reports', description: 'All ORYX audit and execution reports.', body, current: 'reports' }));
  return rendered;
}

// ======================================================================
// Brand
// ======================================================================
async function buildBrand() {
  const files = [];
  for (const dir of ['docs/assets', 'docs/audit/branding']) {
    for (const f of listFiles(dir, ['.png', '.jpg', '.jpeg', '.webp'])) {
      const out = await makeThumb(`${dir}/${f}`, `assets/brand/${dir.split('/').pop()}-${f.replace(/\.(png|jpe?g|webp)$/i, '')}`, 1100);
      files.push({ out, label: `${dir}/${f}` });
    }
  }

  const logoFigure = existsSync(path.join(ASSETS, 'logo.png'))
    ? figure('assets/logo.png', '<strong>Official ORYX logo</strong> — <code>docs/assets/logo.png.jpeg</code>', 'ORYX logo', '../')
    : '<div class="notice">The official logo could not be normalised in this build; see <code>docs/assets/</code>.</div>';

  const body = `
    <p class="eyebrow">Brand</p>
    <h1>Approved visual identity</h1>
    <p class="lede">The official ORYX logo and the approved design references, exactly as committed. Nothing here is redrawn or invented; the product uses the same files.</p>
    <div class="grid">${logoFigure}</div>
    <div class="section-head"><h2>References and brand captures</h2><p>${files.length} assets</p></div>
    <div class="gallery">${files.map((f) => figure(f.out, escapeHtml(f.label), f.label, '../')).join('')}</div>
  `;
  write('brand/index.html', page({ title: 'Brand', description: 'The approved ORYX logo and design references.', body, current: 'brand' }));
  return files.length;
}

// ======================================================================
// Overview
// ======================================================================
async function buildOverview(stats) {
  const prUrl = `${REPO}/pull/7`;
  const body = `
    <p class="eyebrow">Permanent preview</p>
    <h1>ORYX website and design preview</h1>
    <p class="lede">The published ORYX customer website, built from this branch and served at the root of this URL, with the Execution 07 design evidence, audit reports and approved brand assets alongside it.</p>

    <div class="cta">
      <a class="cta__button" href="../">Open the website &rarr;</a>
      <span class="cta__hint">The real Next.js site, statically exported. Every page below the root is that site.</span>
    </div>

    <div class="notice">
      <strong>The website is a static export, so it is read-only.</strong>
      It renders the real pages, themes, photography and layout, but GitHub Pages serves files only: it cannot run the NestJS API or PostgreSQL, so signing in and booking cannot succeed here. The export says so on every page and never reports a write as successful. The interactive application runs from the branch on a host that meets the requirements below.
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi__value">${stats.sitePages}</div><div class="kpi__label">website pages</div></div>
      <div class="kpi"><div class="kpi__value">${stats.reports}</div><div class="kpi__label">reports rendered</div></div>
      <div class="kpi"><div class="kpi__value">${stats.captures}</div><div class="kpi__label">capture pairs</div></div>
      <div class="kpi"><div class="kpi__value">${stats.sheets}</div><div class="kpi__label">light-vs-dark sheets</div></div>
      <div class="kpi"><div class="kpi__value">${stats.brand}</div><div class="kpi__label">brand assets</div></div>
    </div>

    <div class="grid">
      <a class="card card--link" href="../evidence/"><h3>Design evidence</h3><p class="card__meta">Homepage, dashboard, provider directory, sign-in and profile — before/after with the dark render beside each, in Arabic RTL and English LTR at three viewports.</p></a>
      <a class="card card--link" href="../reports/"><h3>Reports</h3><p class="card__meta">Every audit and execution report, rendered from the committed Markdown.</p></a>
      <a class="card card--link" href="../brand/"><h3>Brand</h3><p class="card__meta">The official logo and the approved design references.</p></a>
    </div>

    <h2>What this preview covers</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Area</th><th>State</th><th>Where</th></tr></thead>
      <tbody>
        <tr><td>Premium homepage and service pages</td><td><span class="badge badge--ok">committed</span></td><td>Phase C report, evidence</td></tr>
        <tr><td>Real automotive photography and category fixes</td><td><span class="badge badge--ok">committed</span></td><td>Phase D report</td></tr>
        <tr><td>Light theme (ivory, charcoal, metallic gold)</td><td><span class="badge badge--ok">committed</span></td><td>Phase E report, evidence</td></tr>
        <tr><td>Dark theme (approved identity)</td><td><span class="badge badge--ok">unchanged</span></td><td>Dark-invariance verdict</td></tr>
        <tr><td>Interactive customer app + API</td><td><span class="badge">not hosted here</span></td><td>Hosting requirements below</td></tr>
      </tbody>
    </table></div>

    <h2>How this is published</h2>
    <p>GitHub Actions builds this site on every push to <code>${escapeHtml(BRANCH)}</code> and publishes it with GitHub Pages. The URL is stable and outlives any editor session. The build reads only files already committed to the branch, so the preview can never show something the repository does not contain.</p>

    <h2>Hosting requirements for a full-stack preview</h2>
    <p>A full-stack preview needs a host that can run a long-lived Node process and a PostgreSQL database. GitHub Pages serves static files only and cannot run either. The exact requirements are:</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Component</th><th>Requirement</th></tr></thead>
      <tbody>
        <tr><td>API</td><td>Node 22, a long-lived process, health-checked; secrets for <code>JWT_ACCESS_SECRET</code>, <code>JWT_REFRESH_SECRET</code> and <code>MFA_ENCRYPTION_KEY</code></td></tr>
        <tr><td>Database</td><td>PostgreSQL 17 with <code>prisma migrate deploy</code> and a seed run; isolated from production</td></tr>
        <tr><td>Customer and admin apps</td><td>Node 22 build of two Next.js apps, each on its own origin</td></tr>
        <tr><td>Networking</td><td>HTTPS on both origins; <code>CORS_ORIGINS</code> set to them; the refresh cookie scoped to <code>/api/v1</code></td></tr>
        <tr><td>Isolation</td><td>Separate database, separate secrets, no production credentials or services</td></tr>
      </tbody>
    </table></div>
    <p>Candidate hosts that meet this: a container host (Fly.io, Render, Railway), a small VM, or a Kubernetes namespace. Each needs an account and, for private previews, a token. Until one is configured, this static preview is the permanent, verifiable artifact.</p>

    <h2>Source of truth</h2>
    <p>The pull request is <a href="${prUrl}">#7</a>, still open and unmerged. The branch is <a href="${REPO}/tree/${encodeURIComponent(BRANCH)}"><code>${escapeHtml(BRANCH)}</code></a>. Nothing here is deployed to production.</p>
  `;
  write('overview/index.html', page({ title: 'Overview', description: 'Permanent GitHub-hosted ORYX design preview.', body, current: 'overview' }));
}

// ======================================================================
// Run
// ======================================================================
const reports = buildReports();
const evidence = await buildEvidencePages();
const brandCount = await buildBrand();
const sitePages = countHtml(SITE_SRC);
await buildOverview({
  sitePages,
  reports,
  captures: evidence.captures,
  sheets: evidence.sheets,
  brand: brandCount,
});

// Pages needs a .nojekyll marker so files starting with an underscore or a
// directory it treats as special are served as-is.
writeFileSync(path.join(OUT, '.nojekyll'), '');

const total = thumbsMade.length;
console.log(`preview: built ${OUT}`);
console.log(
  `preview: website at / (${sitePages} pages), ${reports} reports, ` +
    `${evidence.captures} capture pairs, ${evidence.sheets} sheets, ${brandCount} brand assets, ${total} images`,
);
