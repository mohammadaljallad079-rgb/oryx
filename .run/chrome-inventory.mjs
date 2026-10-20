/**
 * Reports the *visible* chrome values — borders, radii, shadows, chip fills —
 * grouped by the role a component plays, across every customer surface.
 *
 * The point is to catch the "each component carries its own value" pattern: if
 * two chip-like elements resolve to different border colours, or two cards to
 * different radii, the theme reads as assembled rather than designed even when
 * every text pair passes WCAG.
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:12001';
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light';
const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };
const PATHS = ['/', '/services', '/providers', '/login', '/dashboard', '/bookings', '/invoices', '/support', '/profile', '/notifications', '/garage'];

// Every element that carries one of these classes, grouped by class name.
const CLASSES = [
  'oryx-card', 'oryx-kpi', 'oryx-btn', 'oryx-btn-primary', 'oryx-input', 'oryx-select',
  'oryx-badge', 'oryx-chip', 'oryx-pill', 'oryx-tag', 'oryx-table', 'oryx-page-head',
  'oryx-auth__card', 'oryx-feature', 'oryx-stat', 'oryx-service-card', 'oryx-cat-card',
  'oryx-dash-hero', 'oryx-footer', 'oryx-header', 'oryx-section', 'oryx-empty',
  'oryx-choice', 'oryx-slot', 'oryx-list', 'oryx-list-item', 'oryx-alert',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => window.localStorage.setItem('oryx.customer.theme', t), THEME);
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });

const table = new Map();

for (const path of PATHS) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);
  const rows = await page.evaluate((classes) => {
    const out = [];
    for (const cls of classes) {
      for (const el of document.querySelectorAll(`.${cls}`)) {
        const cs = getComputedStyle(el);
        out.push({
          cls,
          radius: cs.borderRadius,
          bw: cs.borderTopWidth,
          bc: cs.borderTopColor,
          bg: cs.backgroundColor,
          shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 46),
          pad: cs.padding,
        });
      }
    }
    return out;
  }, CLASSES);
  for (const r of rows) {
    const key = r.cls;
    table.set(key, table.get(key) ?? {});
    const props = table.get(key);
    for (const p of ['radius', 'bw', 'bc', 'bg', 'shadow', 'pad']) {
      props[p] ??= {};
      props[p][r[p]] ??= new Set();
      props[p][r[p]].add(path);
    }
  }
}

console.log(`\n=== chrome inventory: ${THEME} ===`);
for (const [cls, props] of [...table.entries()].sort()) {
  const parts = [];
  for (const [p, values] of Object.entries(props)) {
    const vals = Object.keys(values);
    if (vals.length > 1) parts.push(`${p}=${vals.length}`);
  }
  if (!parts.length) continue;
  console.log(`\n${cls}  (${parts.join(' ')})`);
  for (const [p, values] of Object.entries(props)) {
    const vals = Object.keys(values);
    if (vals.length < 2) continue;
    for (const v of vals) console.log(`    ${p.padEnd(7)} ${v}   <- ${[...values[v]].join(' ')}`);
  }
}
await browser.close();
