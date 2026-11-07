/**
 * Execution 07 Phase E — pixel-level overlay contrast probe.
 *
 * Photo-backed surfaces (the homepage hero, category cards, the dashboard hero
 * and the page header) layer text over artwork behind a gradient scrim. The
 * scrim's opacity and the text colour both come from theme tokens, so a theme
 * change can silently produce dark-on-dark text. Reading computed CSS misses
 * this because the offending colour is in the photograph, not in a property.
 *
 * This script renders the surface, then samples the real screenshot pixels in
 * the band the caption occupies, reports the darkest and lightest pixel, and
 * computes the contrast between the caption's colour and that measured band.
 *
 * Run with: node .run/probe-overlay-contrast.mjs
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const CUSTOMER = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';

function parseRgb(v) {
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
}
function lum([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

const TARGETS = [
  ['homepage-hero', '/', '.oryx-hero--home', '.oryx-hero__title'],
  ['category-card', '/', '.oryx-cat-card', '.oryx-cat-card__body strong'],
  ['dashboard-hero', '/dashboard', '.oryx-dash-hero', '.oryx-dash-hero__title'],
  ['page-header', '/providers', '.oryx-page-head', '.oryx-page-head__title'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();

await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').first().fill('customer@oryx-demo.local');
await page.locator('input[type="password"]').first().fill('OryxDemo!2026');
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });
await page.waitForTimeout(2000);

const out = {};
for (const theme of ['light', 'dark']) {
  out[theme] = {};
  for (const [name, path, containerSel, textSel] of TARGETS) {
    await page.evaluate((t) => window.localStorage.setItem('oryx.customer.theme', t), theme);
    await page.goto(`${CUSTOMER}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1800);

    const box = await page.locator(textSel).first().boundingBox().catch(() => null);
    const info = await page.evaluate(
      ([ts]) => {
        const el = document.querySelector(ts);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
      },
      [textSel],
    );
    if (!box || !info) {
      out[theme][name] = { error: 'element not found' };
      console.log(`${theme} ${name}: element not found`);
      continue;
    }

    // Hide the caption before sampling so its own glyphs do not skew the band.
    await page.evaluate((ts) => {
      const el = document.querySelector(ts);
      if (el) el.style.visibility = 'hidden';
    }, textSel);
    await page.waitForTimeout(250);
    const shot = await page.screenshot({
      clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.max(1, box.width), height: Math.max(1, box.height) },
    });
    const png = PNG.sync.read(shot);
    const fg = parseRgb(info.color);
    let minL = Infinity;
    let maxL = -Infinity;
    let sumL = 0;
    let n = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const px = [png.data[i], png.data[i + 1], png.data[i + 2]];
      const l = lum(px);
      minL = Math.min(minL, l);
      maxL = Math.max(maxL, l);
      sumL += l;
      n += 1;
    }
    // Worst case for dark text is the darkest background pixel; for light text
    // it is the lightest.
    const avg = sumL / n;
    const toLum = (l) => {
      const [x, y] = [lum(fg), l].sort((p, q) => q - p);
      return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
    };
    const isDarkText = lum(fg) < 0.5;
    const worst = isDarkText ? minL : maxL;
    const rec = {
      color: info.color,
      fontSize: info.fontSize,
      fontWeight: info.fontWeight,
      bandLumMin: Math.round(minL * 1000) / 1000,
      bandLumMax: Math.round(maxL * 1000) / 1000,
      bandLumAvg: Math.round(avg * 1000) / 1000,
      contrastAvg: toLum(avg),
      contrastWorst: toLum(worst),
    };
    out[theme][name] = rec;
    console.log(
      `${theme.padEnd(5)} ${name.padEnd(16)} fg=${rec.color.padEnd(20)} avg=${rec.contrastAvg} worst=${rec.contrastWorst}`,
    );
  }
}

await browser.close();
console.log('\nJSON');
console.log(JSON.stringify(out, null, 2));
