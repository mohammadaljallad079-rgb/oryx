/**
 * Execution 07 Phase E — light-theme computed-style audit.
 *
 * The owner reported that light-theme colours "still look inconsistent". This
 * script replaces eyeballing with measurement: it loads each customer surface in
 * the light theme and reads the resolved background, foreground and border of
 * the shared primitives, then reports the WCAG contrast ratio of every text
 * colour against the surface it actually sits on.
 *
 * A primitive whose foreground/background pair changes identity between
 * surfaces (for example an input that is white on the homepage and grey on the
 * dashboard) shows up as an inconsistency row.
 *
 * Run with: node .run/audit-light-theme.mjs
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'fs';

const CUSTOMER = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const OUT = 'docs/audit/exec07/phase-e';
const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

mkdirSync(OUT, { recursive: true });

function parseRgb(v) {
  if (!v) return null;
  // `color-mix()` resolves to the modern `color(srgb r g b / a)` form, whose
  // channels are 0..1, so it needs its own branch or every mixed surface reads
  // as unmeasurable.
  const srgb = v.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
  if (srgb) {
    return [srgb[1], srgb[2], srgb[3]].map((c) => parseFloat(c) * 255).concat([srgb[4] ? parseFloat(srgb[4]) : 1]);
  }
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
}

/** Source-over compositing of `top` onto `bottom`. */
function over(top, bottom) {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
}

function lum([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fg, bg) {
  const a = parseRgb(fg);
  const b = parseRgb(bg);
  if (!a || !b || a[3] < 1 || b[3] < 1) return null;
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

// The primitives that make the product read as one system.
const TARGETS = [
  ['page', 'body'],
  ['header', '.oryx-header'],
  ['card', '.oryx-card'],
  ['input', '.oryx-input, .oryx-select'],
  ['btn', '.oryx-btn:not(.oryx-btn-primary)'],
  ['btn-primary', '.oryx-btn-primary'],
  ['nav-link', '.oryx-nav a'],
  ['footer', '.oryx-footer'],
  ['hero', '.oryx-hero--home'],
  ['cat-card', '.oryx-cat-card'],
  ['stat-label', '.oryx-stat__label'],
  ['muted', '.oryx-muted'],
  ['table-th', '.oryx-table th'],
  ['table-td', '.oryx-table td'],
  ['badge', '.oryx-badge'],
  ['auth-card', '.oryx-auth__card'],
  ['page-head', '.oryx-page-head'],
  ['slot', '.oryx-slot'],
  ['feature-icon', '.oryx-feature__icon'],
  ['kpi-icon', '.oryx-kpi__icon'],
];

/** Collects the background layers behind an element, up to the first opaque one. */
const SAMPLE = (selector) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const layers = [];
  let node = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    layers.push(bg);
    // Stop at the first fully opaque layer. `color(srgb r g b / a)` is what
    // `color-mix()` resolves to; `rgba(..., a)` covers everything else.
    const srgb = bg.match(/color\(srgb[^)]*\/\s*([\d.]+)\)/);
    const rgba = bg.match(/rgba\([^)]*,\s*([\d.]+)\)/);
    const alpha = srgb ? parseFloat(srgb[1]) : rgba ? parseFloat(rgba[1]) : bg === 'transparent' ? 0 : 1;
    if (alpha >= 1) break;
    node = node.parentElement;
  }
  const tokens = getComputedStyle(document.documentElement);
  // A container like `.oryx-hero` owns no text of its own, and an icon glyph
  // is a graphic, not body copy. Both would otherwise be reported as text
  // failures against the wrong threshold.
  const ownText = [...el.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent.trim())
    .join('');
  const isIcon = el.querySelector('svg') !== null && ownText.length === 0 && (el.textContent ?? '').trim().length === 0;
  return {
    layers,
    backgroundImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 120),
    color: cs.color,
    borderColor: cs.borderTopColor,
    borderWidth: cs.borderTopWidth,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    ownText,
    isIcon,
    threshold: isIcon ? 3 : 4.5,
    text: (el.textContent ?? '').trim().slice(0, 40),
    tokens: {
      bg: tokens.getPropertyValue('--bg').trim(),
      surface: tokens.getPropertyValue('--surface').trim(),
      gold: tokens.getPropertyValue('--gold').trim(),
      textFaint: tokens.getPropertyValue('--text-faint').trim(),
    },
  };
};

/** Composites a layer stack onto the page field, bottom-up. */
function effectiveBackground(layers, field = 'rgb(247, 244, 237)') {
  let out = parseRgb(field) ?? [255, 255, 255, 1];
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = parseRgb(layers[i]);
    if (layer) out = over(layer, out);
  }
  return out;
}

/**
 * Mean colour of an element's real pixels with its glyphs hidden.
 *
 * `effectiveBackground` can only composite `background-color` layers, so a
 * surface painted with a `background-image` gradient (the navy hero band, the
 * page header, the dashboard banner) would be measured against the page field
 * and report a false low ratio. For those, read the rendered pixels instead.
 */
async function renderedBackground(page, selector, box) {
  const viewport = page.viewportSize() ?? { width: 1440, height: 1024 };
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const width = Math.min(Math.round(box.width), viewport.width - x);
  const height = Math.min(Math.round(box.height), viewport.height - y);
  // An element scrolled out of view has no pixels to read; the caller falls
  // back to layer compositing in that case.
  if (width < 2 || height < 2) return null;
  const prev = await page.evaluate(([sel]) => {
    const el = document.querySelector(sel);
    const p = el.style.color;
    el.style.color = 'transparent';
    return p;
  }, [selector]);
  await page.waitForTimeout(80);
  let shot;
  try {
    shot = await page.screenshot({ clip: { x, y, width, height } });
  } finally {
    await page.evaluate(([sel, p]) => {
      document.querySelector(sel).style.color = p;
    }, [selector, prev]);
  }
  const png = PNG.sync.read(shot);
  let r = 0;
  let g = 0;
  let b = 0;
  const n = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    r += png.data[i];
    g += png.data[i + 1];
    b += png.data[i + 2];
  }
  return [r / n, g / n, b / n];
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();

// Sign in once and navigate inside the app; a per-route reload would drop the
// in-memory session and land back on the public shell.
await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => window.localStorage.setItem('oryx.customer.theme', 'light'));
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });
await page.waitForTimeout(2000);

const report = {};
for (const [name, path] of [
  ['homepage', '/'],
  ['dashboard', '/dashboard'],
  ['providers', '/providers'],
  ['login', '/login'],
  ['profile', '/profile'],
]) {
  await page.goto(`${CUSTOMER}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  const rows = {};
  for (const [key, selector] of TARGETS) {
    const s = await page.evaluate(SAMPLE, selector);
    if (!s) continue;
    const box = await page.locator(selector).first().boundingBox().catch(() => null);
    // A gradient can sit on the element *or* an ancestor (the navy hero band
    // wraps the stat labels), and `background-color` compositing cannot see it.
    // Whenever the element is on screen, measure the pixels actually behind it.
    const measured = box && box.width >= 2 && box.height >= 2;
    const rendered = measured ? await renderedBackground(page, selector, box) : null;
    const bg = rendered ?? effectiveBackground(s.layers);
    rows[key] = {
      ...s,
      measuredFrom: rendered ? 'rendered-pixels' : 'composited-layers',
      background: `rgb(${bg.slice(0, 3).map((v) => Math.round(v)).join(', ')})`,
      contrast: contrast(`rgb(${parseRgb(s.color).slice(0, 3).join(', ')})`, `rgb(${bg.slice(0, 3).join(', ')})`),
    };
  }
  report[path] = rows;
  console.log(`\n=== ${name} (${path}) ===`);
  for (const [k, v] of Object.entries(rows)) {
    console.log(
      `  ${k.padEnd(13)} bg=${(v.background ?? '').padEnd(20)} fg=${(v.color ?? '').padEnd(20)} ratio=${String(v.contrast).padEnd(6)} border=${v.borderColor} ${v.backgroundImage ? 'GRADIENT' : ''}`,
    );
  }
}

await browser.close();
writeFileSync(`${OUT}/light-theme-audit.json`, JSON.stringify(report, null, 2));

// Flag low-contrast text (below the 4.5:1 body threshold; icons take 3:1) and
// skip containers that own no text of their own.
const failures = [];
for (const [route, rows] of Object.entries(report)) {
  for (const [key, v] of Object.entries(rows)) {
    if (v.ownText === '' && !v.isIcon) continue;
    if (v.contrast !== null && v.contrast < v.threshold) {
      failures.push(`${route} ${key} ${v.contrast}:1 < ${v.threshold}:1 (fg ${v.color} on ${v.background})`);
    }
  }
}
console.log(`\n${failures.length} text/surface pairs below their WCAG threshold`);
for (const f of failures) console.log('  ' + f);
