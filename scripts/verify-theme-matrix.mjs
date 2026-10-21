/**
 * Verify the customer site across the full theme matrix.
 *
 * The matrix is theme (light|dark) x direction (rtl|ltr) x viewport
 * (mobile|tablet|desktop). For every cell it asserts the properties a
 * regression would break silently:
 *
 *   - <html> carries the requested data-theme and data-dir
 *   - the rendered text clears WCAG AA against the pixels actually behind it
 *   - nothing overflows the viewport horizontally
 *   - the Arabic build renders RTL and the English build LTR
 *
 * Contrast is measured the way `.run/probe-rendered-contrast.mjs` does it: the
 * element is screenshotted with its glyphs set to `transparent`, so the sample
 * is the real surface — including a gradient or a photograph — rather than a
 * `background-color` that a layered panel does not have. A naive
 * computed-style walk-up reports false failures on the navy hero band and the
 * page headers, which are painted with `background-image`.
 *
 * Usage:
 *   ORYX_BASE=https://www.example.com node scripts/verify-theme-matrix.mjs
 *
 * `ORYX_INSECURE=1` accepts a self-signed certificate (pre-launch rehearsal
 * only). The script exits non-zero when any cell fails.
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.ORYX_BASE ?? 'http://127.0.0.1:3002';
const OUT = process.env.ORYX_OUT ?? '/tmp/oryx-exec09/theme-matrix';
const INSECURE = process.env.ORYX_INSECURE === '1';

const THEMES = ['light', 'dark'];
const DIRS = [
  { dir: 'rtl', locale: 'ar' },
  { dir: 'ltr', locale: 'en' },
];
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'desktop', width: 1440, height: 900 },
];

/** Prominent text on the homepage. Each is measured against its own pixels. */
const TARGETS = [
  '.oryx-hero__title',
  '.oryx-hero__lede',
  '.oryx-eyebrow',
  '.oryx-section__title',
  '.oryx-card-title',
  '.oryx-stat__label',
  '.oryx-stat__value',
  '.oryx-btn--primary',
  '.oryx-btn--ghost',
  '.oryx-muted',
];

const lum = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const meanOf = (png, box) => {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = box.y; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const i = (png.width * y + x) << 2;
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
      n += 1;
    }
  }
  return n === 0 ? null : [r / n, g / n, b / n];
};

const parseRgb = (css) => {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((v) => parseFloat(v.trim()));
  return [p[0], p[1], p[2]];
};

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const theme of THEMES) {
  for (const { dir, locale } of DIRS) {
    for (const vp of VIEWPORTS) {
      const cell = `${theme}-${dir}-${vp.name}`;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        ignoreHTTPSErrors: INSECURE,
        locale,
      });
      await ctx.addInitScript(
        ([t, l]) => {
          try {
            window.localStorage.setItem('oryx.customer.theme', t);
            window.localStorage.setItem('oryx.customer.locale', l);
          } catch {
            /* storage unavailable before first paint is not fatal */
          }
        },
        [theme, locale],
      );

      const page = await ctx.newPage();
      const failures = [];
      const warnings = [];
      const measured = [];

      try {
        await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90_000 });
        await page.waitForTimeout(800);

        const state = await page.evaluate(() => {
          const html = document.documentElement;
          return {
            theme: html.getAttribute('data-theme'),
            dir: html.getAttribute('dir'),
            lang: html.getAttribute('lang'),
            scrollW: document.documentElement.scrollWidth,
            clientW: document.documentElement.clientWidth,
          };
        });

        if (state.theme !== theme) failures.push(`data-theme is "${state.theme}", expected "${theme}"`);
        if (state.dir !== dir) failures.push(`dir is "${state.dir}", expected "${dir}"`);
        if (state.scrollW > state.clientW + 1) {
          failures.push(`horizontal overflow: scrollWidth ${state.scrollW} > clientWidth ${state.clientW}`);
        }

        for (const sel of TARGETS) {
          const el = page.locator(sel).first();
          if ((await el.count()) === 0) continue;
          // Bring the element into the viewport: a clip outside the rendered
          // area is rejected by Playwright, and an element below the fold is
          // not painted at all.
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(120);
          const box = await el.boundingBox();
          if (!box || box.width < 4 || box.height < 4) continue;
          const vpBox = page.viewportSize();
          if (box.y + box.height < 1 || box.y > vpBox.height) continue;
          const ink = await el.evaluate((n) => getComputedStyle(n).color);
          const inkRgb = parseRgb(ink);
          if (!inkRgb) continue;

          // Hide the glyphs only; every background layer stays painted.
          const prev = await el.evaluate(async (n) => {
            const p = n.style.color;
            n.style.color = 'transparent';
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return p;
          });
          const shot = await page.screenshot({
            clip: {
              x: Math.round(box.x),
              y: Math.round(box.y),
              width: Math.max(1, Math.round(box.width)),
              height: Math.max(1, Math.round(box.height)),
            },
          });
          await el.evaluate((n, p) => {
            n.style.color = p;
          }, prev);

          const png = PNG.sync.read(shot);
          const surface = meanOf(png, { x: 0, y: 0, width: png.width, height: png.height });
          if (!surface) continue;

          const fontSize = await el.evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
          const cr = ratio(inkRgb, surface);
          const min = fontSize >= 24 ? 3 : 4.5;
          measured.push({
            selector: sel,
            ink,
            surface: surface.map((v) => Math.round(v)),
            contrast: Number(cr.toFixed(2)),
            fontSize,
            min,
          });
          if (cr < min) {
            failures.push(
              `${sel} contrast ${cr.toFixed(2)}:1 below ${min}:1 (ink ${ink} on rgb(${surface
                .map((v) => Math.round(v))
                .join(', ')}))`,
            );
          }
        }

        if (measured.length === 0) warnings.push('no text surfaces were measurable on this page');

        const shot = join(OUT, `${cell}.png`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(150);
        await page.screenshot({ path: shot, fullPage: false });

        results.push({
          cell,
          theme,
          dir,
          locale,
          viewport: vp.name,
          themeAttr: state.theme,
          dirAttr: state.dir,
          langAttr: state.lang,
          measured,
          screenshot: shot,
          failures,
          warnings,
        });
      } catch (err) {
        failures.push(`navigation failed: ${err.message}`);
        results.push({ cell, theme, dir, locale, viewport: vp.name, failures, warnings, measured });
      }

      await ctx.close();
      console.log(
        `${failures.length === 0 ? 'PASS' : 'FAIL'}  ${cell}  (${failures.length} failure(s), ${measured.length} pairs)`,
      );
      for (const f of failures) console.log(`        ${f}`);
      for (const w of warnings) console.log(`      ! ${w}`);
    }
  }
}

await browser.close();

const failed = results.filter((r) => r.failures.length > 0);
const report = {
  base: BASE,
  generatedAt: new Date().toISOString(),
  cells: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

console.log(`\n${report.passed}/${report.cells} cells passed`);
console.log(`report: ${join(OUT, 'report.json')}`);
process.exit(failed.length === 0 ? 0 : 1);
