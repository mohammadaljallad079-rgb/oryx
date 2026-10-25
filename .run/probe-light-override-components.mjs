/**
 * Measure the components that carry a light-only scoped override, in both
 * themes, so the overrides can be replaced by token-driven base rules without
 * changing the approved dark render.
 *
 * Usage: node .run/probe-light-override-components.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const USER = {
  email: process.env.ORYX_CUSTOMER_EMAIL ?? 'rider@oryx.local',
  password: process.env.ORYX_CUSTOMER_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const SELECTORS = [
  ['cat-card__desc', '.oryx-cat-card__desc'],
  ['dash-hero', '.oryx-dash-hero'],
  ['footer-btn', '.oryx-footer .oryx-btn'],
  ['hero-eyebrow', '.oryx-hero .oryx-eyebrow'],
];

const PROPS = [
  'color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderTopWidth',
  'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'paddingTop',
  'borderRadius', 'minHeight',
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', USER.email);
await page.fill('input[type="password"]', USER.password);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);

const result = {};
for (const theme of ['dark', 'light']) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('oryx.theme', t);
  }, theme);
  result[theme] = {};
  for (const [name, sel] of SELECTORS) {
    const home = name === 'dash-hero' ? '/dashboard' : '/';
    await page.goto(`${BASE}${home}`, { waitUntil: 'networkidle' });
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(200);
    const val = await page.evaluate(({ sel, PROPS }) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const o = {};
      for (const p of PROPS) o[p] = cs[p];
      return o;
    }, { sel, PROPS });
    result[theme][name] = val;
  }
}

for (const [name] of SELECTORS) {
  console.log(`\n=== ${name} ===`);
  const d = result.dark[name] || {};
  const l = result.light[name] || {};
  for (const p of PROPS) {
    const dv = d[p] ?? '(none)';
    const lv = l[p] ?? '(none)';
    const mark = dv === lv ? '  ' : '≠ ';
    console.log(`  ${mark}${p}`);
    console.log(`      dark   = ${dv}`);
    console.log(`      light  = ${lv}`);
  }
}

await browser.close();
