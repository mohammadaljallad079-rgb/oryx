/**
 * Full computed-style dump of the components carrying a light-only override, in
 * both themes, so the override can be replaced by tokens that reproduce the
 * approved dark render exactly.
 *
 * Usage: node .run/probe-override-props.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const USER = {
  email: process.env.ORYX_CUSTOMER_EMAIL ?? 'rider@oryx.local',
  password: process.env.ORYX_CUSTOMER_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const SELECTORS = [
  ['cat-card__desc', '/', '.oryx-cat-card__desc'],
  ['dash-hero', '/dashboard', '.oryx-dash-hero'],
  ['footer-btn', '/', '.oryx-footer .oryx-btn'],
  ['hero-eyebrow', '/', '.oryx-hero .oryx-eyebrow'],
];

const PROPS = [
  'color', 'backgroundColor', 'backgroundImage', 'borderTopColor',
  'fontSize', 'fontWeight', 'letterSpacing', 'textTransform',
  'marginTop', 'marginBottom', 'paddingTop',
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', USER.email);
await page.fill('input[type="password"]', USER.password);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);

const out = {};
for (const theme of ['dark', 'light']) {
  out[theme] = {};
  for (const [name, path, sel] of SELECTORS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(200);
    out[theme][name] = await page.evaluate(({ sel, PROPS }) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const o = {};
      for (const p of PROPS) o[p] = cs[p];
      return o;
    }, { sel, PROPS });
  }
}

for (const [name] of SELECTORS) {
  console.log(`\n=== ${name} ===`);
  const d = out.dark[name] || {};
  const l = out.light[name] || {};
  for (const p of PROPS) {
    const mark = (d[p] ?? '') === (l[p] ?? '') ? '  ' : '≠ ';
    console.log(`  ${mark}${p}: dark=${d[p]}  light=${l[p]}`);
  }
}

await browser.close();
