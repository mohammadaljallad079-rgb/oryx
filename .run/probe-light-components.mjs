/**
 * Probes the light-theme computed styles of the shared component classes
 * (buttons, cards, navigation, forms, tables) so inconsistencies can be seen
 * as numbers rather than by eye. Read-only.
 *
 * Run with: node .run/probe-light-components.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';

const parse = (c) => {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p[3] ?? 1];
};
const lum = ([r, g, b]) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (fg, bg) => {
  const a = lum(fg);
  const b = lum(bg);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.setItem('oryx.customer.theme', 'light');
  localStorage.setItem('oryx.customer.locale', 'en');
});

const SELECTORS = [
  ['.oryx-btn-primary', 'primary button'],
  ['.oryx-btn:not(.oryx-btn-primary)', 'secondary button'],
  ['.oryx-card', 'card'],
  ['.oryx-field input, .oryx-field select, .oryx-field textarea', 'form field'],
  ['.oryx-site-header', 'navigation'],
  ['.oryx-table th', 'table head'],
  ['.oryx-table td', 'table cell'],
  ['.oryx-hero__title', 'hero title'],
  ['.oryx-hero__lede', 'hero lede'],
  ['.oryx-stat__value', 'hero stat value'],
  ['.oryx-footer', 'footer'],
  ['.oryx-footer__col a', 'footer link'],
];

for (const path of ['/', '/providers', '/login']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  console.log(`\n== ${path} ==`);
  for (const [sel, label] of SELECTORS) {
    const info = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const cs = getComputedStyle(el);
      let bg = cs.backgroundColor;
      let node = el;
      while ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && node.parentElement) {
        node = node.parentElement;
        bg = getComputedStyle(node).backgroundColor;
      }
      return { color: cs.color, bg, border: cs.borderTopColor, radius: cs.borderRadius, font: cs.fontWeight };
    }, sel);
    if (!info) continue;
    const fg = parse(info.color);
    const bg = parse(info.bg);
    const cr = fg && bg && fg[3] === 1 && bg[3] === 1 ? ratio(fg, bg) : null;
    console.log(
      `  ${label.padEnd(18)} ink=${info.color.padEnd(20)} bg=${info.bg.padEnd(22)} contrast=${cr ?? 'n/a'}`,
    );
  }
}

await browser.close();
