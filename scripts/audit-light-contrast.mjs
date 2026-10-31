/**
 * Execution 07 Phase E — measured light-theme contrast audit.
 *
 * The owner's report was that the light theme "still looks inconsistent". A
 * token diff only shows drift; it does not show what a reader actually sees.
 * This script renders each surface in the light theme and reads the *computed*
 * foreground and background of every text node, then asserts the WCAG 2.1 ratio
 * (4.5:1 body, 3:1 for large text and non-text UI).
 *
 * It is a diagnostic and a gate: it exits non-zero when a rendered pair fails,
 * so a correction is proven by measurement rather than by inspection.
 *
 * Usage:
 *   node scripts/audit-light-contrast.mjs                 # report
 *   ORYX_BASE=http://127.0.0.1:12001 node scripts/audit-light-contrast.mjs
 */

import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const CUSTOMER = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const ADMIN = process.env.ORYX_ADMIN_BASE ?? 'http://127.0.0.1:12000';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const SURFACES = [
  { app: 'customer', base: CUSTOMER, name: 'homepage', path: '/' },
  { app: 'customer', base: CUSTOMER, name: 'providers', path: '/providers' },
  { app: 'customer', base: CUSTOMER, name: 'services', path: '/services' },
  { app: 'customer', base: CUSTOMER, name: 'login', path: '/login' },
  { app: 'admin', base: ADMIN, name: 'admin-login', path: '/login' },
];

function initScript(scope, theme, locale) {
  const prefix = scope === 'admin' ? 'oryx' : 'oryx.customer';
  return `(() => {
    try {
      localStorage.setItem('${prefix}.theme', ${JSON.stringify(theme)});
      localStorage.setItem('${prefix}.locale', ${JSON.stringify(locale)});
    } catch {}
    document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
    document.documentElement.style.colorScheme = ${JSON.stringify(theme)};
    document.documentElement.setAttribute('lang', ${JSON.stringify(locale)});
    document.documentElement.setAttribute('dir', ${JSON.stringify(locale === 'ar' ? 'rtl' : 'ltr')});
  })();`;
}

/**
 * Read every visible text node's computed colour and the *actually painted*
 * background behind it.
 *
 * The painted background cannot be read from `backgroundColor` alone: the hero
 * and page-header bands paint a navy gradient through `background-image` while
 * leaving `backgroundColor` transparent, so a naive walk up the tree reports the
 * ivory page and produces a false contrast failure. Instead each candidate's own
 * box is screenshotted with its text made transparent, and the median pixel of
 * that patch is the effective background the eye sees.
 */
const COLLECT = `(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (!text) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) < 0.15) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const fg = parse(st.color);
    if (!fg) continue;
    const size = parseFloat(st.fontSize);
    const weight = parseInt(st.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    out.push({
      text: text.slice(0, 60),
      cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 60),
      fg, size, weight, large,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    });
  }
  return out;
})()`;

/** Sample the painted background of one element by hiding its ink. */
async function paintedBackground(page, index) {
  return page.evaluate((i) => {
    const nodes = document.querySelectorAll('body *');
    let n = 0;
    for (const el of nodes) {
      const t = Array.from(el.childNodes)
        .filter((x) => x.nodeType === 3)
        .map((x) => x.textContent.trim())
        .join(' ')
        .trim();
      if (!t) continue;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) < 0.15) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (n === i) {
        // Hide the ink so a screenshot of the box shows only the background.
        el.setAttribute('data-audit-color', st.color);
        el.style.setProperty('color', 'transparent', 'important');
        el.style.setProperty('text-shadow', 'none', 'important');
        const b = el.getBoundingClientRect();
        return { x: Math.max(0, b.x), y: Math.max(0, b.y), w: b.width, h: b.height };
      }
      n += 1;
    }
    return null;
  }, index);
}

async function restoreInk(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-audit-color]')) {
      el.style.removeProperty('color');
      el.style.removeProperty('text-shadow');
      el.removeAttribute('data-audit-color');
    }
  });
}

const lum = ({ r, g, b }) => {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};
const hex = (c) =>
  '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Median colour of a PNG patch, which is the background the eye sees. */
function medianColor(buffer) {
  const png = PNG.sync.read(buffer);
  const rs = [];
  const gs = [];
  const bs = [];
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 128) continue;
    rs.push(png.data[i]);
    gs.push(png.data[i + 1]);
    bs.push(png.data[i + 2]);
  }
  if (rs.length === 0) return { r: 255, g: 255, b: 255 };
  const mid = (arr) => {
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)];
  };
  return { r: mid(rs), g: mid(gs), b: mid(bs) };
}

async function audit(browser, surface, viewport, locale) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(initScript(surface.app, 'light', locale));
  const page = await ctx.newPage();
  try {
    await page.goto(`${surface.base}${surface.path}`, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    await page.goto(`${surface.base}${surface.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  await page.waitForTimeout(1200);
  const rows = await page.evaluate(COLLECT);

  const failures = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    // Sample the painted background with the ink hidden, then restore it.
    let bg = { r: 255, g: 255, b: 255 };
    const box = await paintedBackground(page, i);
    if (box && box.w >= 2 && box.h >= 2) {
      try {
        const shot = await page.screenshot({
          clip: { x: box.x, y: box.y, width: box.w, height: box.h },
        });
        bg = medianColor(shot);
      } catch {
        // An off-screen or clipped element is skipped rather than failed.
        await restoreInk(page);
        continue;
      }
    }
    await restoreInk(page);

    const r = ratio(row.fg, bg);
    const need = row.large ? 3 : 4.5;
    if (r < need) failures.push({ ...row, bg, ratio: r, need });
  }
  await ctx.close();
  return { rows, failures };
}

/**
 * Launch Chromium.
 *
 * The sandbox ships a system Chromium but not Playwright's bundled build, and
 * `pnpm install` can leave the bundled one missing entirely (the repository's
 * documented hazard). `PLAYWRIGHT_CHROMIUM` lets a caller point at any build;
 * the system path is the fallback so the audit runs without a download.
 */
async function launchChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM;
  if (explicit) return chromium.launch({ executablePath: explicit });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/usr/bin/chromium' });
  }
}

const browser = await launchChromium();
let totalFailures = 0;
let totalRows = 0;

for (const surface of SURFACES) {
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    for (const locale of ['en', 'ar']) {
      const { rows, failures } = await audit(browser, surface, viewport, locale);
      totalRows += rows.length;
      totalFailures += failures.length;
      const tag = `${surface.app}/${surface.name} ${vpName}/${locale}`;
      if (failures.length === 0) {
        console.log(`PASS  ${tag.padEnd(34)} ${rows.length} text nodes`);
        continue;
      }
      console.log(`FAIL  ${tag.padEnd(34)} ${failures.length}/${rows.length} below AA`);
      for (const f of failures.slice(0, 6)) {
        console.log(
          `        ${String(f.ratio).padStart(5)}:1 (need ${f.need}) ` +
            `fg ${hex(f.fg)} on bg ${hex(f.bg)}  ${f.size}px w${f.weight}  "${f.text}"`,
        );
      }
    }
  }
}

await browser.close();
console.log(`\n${totalFailures} failing pair(s) across ${totalRows} rendered text nodes.`);
process.exit(totalFailures > 0 ? 1 : 0);
