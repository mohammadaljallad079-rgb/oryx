/**
 * Measures the bounding boxes of the homepage's key blocks so a layout shift
 * caused by a typography change can be quantified and checked for overlap.
 *
 * Usage: node .run/measure-layout.mjs <out.json> [theme]
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const OUT = process.argv[2] || '/tmp/layout.json';
const THEME = process.argv[3] || 'light';
const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:8123';
const SITE = process.env.ORYX_BASE_PATH || '/oryx';

const SELECTORS = [
  '.oryx-preview-strip',
  '.oryx-header',
  '.oryx-hero',
  '.oryx-hero .oryx-eyebrow',
  '.oryx-hero__title',
  '.oryx-hero__lede',
  '.oryx-hero__actions',
  '.oryx-stat-row',
  '.oryx-cat-card',
  '.oryx-footer',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
await ctx.addInitScript((t) => {
  try {
    window.localStorage.setItem('oryx.customer.theme', t);
    window.localStorage.setItem('oryx.customer.locale', 'ar');
  } catch {
    /* no storage */
  }
}, THEME);
const page = await ctx.newPage();
await page.goto(`${BASE}${SITE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const result = await page.evaluate((selectors) => {
  const out = {};
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) {
      out[sel] = null;
      continue;
    }
    const r = el.getBoundingClientRect();
    out[sel] = {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      height: Math.round(r.height),
    };
  }
  return out;
}, SELECTORS);

writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`wrote ${OUT}`);
for (const [k, v] of Object.entries(result)) {
  console.log(`  ${k.padEnd(28)} ${v ? `top=${v.top} bottom=${v.bottom} h=${v.height}` : 'MISSING'}`);
}
await browser.close();
