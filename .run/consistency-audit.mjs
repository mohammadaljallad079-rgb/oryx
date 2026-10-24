/**
 * Consistency audit for the light theme.
 *
 * Contrast is not the only way a theme looks inconsistent: two cards with
 * different radii, two buttons with different heights, or three "muted" greys
 * all read as sloppy while every pair still passes WCAG. This walks every
 * customer surface and reports, per component class, the *distinct* values of
 * the properties that make a system look like one system.
 *
 * A property with more than one value across the set is printed as a defect.
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light';
const LOCALE = process.argv[3] ?? 'en';
const USER = {
  email: process.env.ORYX_CUSTOMER_EMAIL ?? 'rider@oryx.local',
  password: process.env.ORYX_CUSTOMER_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const PATHS = ['/', '/services', '/providers', '/login', '/dashboard', '/bookings', '/invoices', '/support', '/profile', '/notifications', '/garage'];

// component selector -> CSS properties that should be uniform
const GROUPS = {
  'card (.oryx-card)': ['.oryx-card', ['borderRadius', 'borderTopWidth', 'padding', 'backgroundColor']],
  'kpi (.oryx-kpi)': ['.oryx-kpi', ['borderRadius', 'borderTopWidth', 'backgroundColor']],
  'button (.oryx-btn)': ['.oryx-btn:not(.oryx-btn-primary):not(.oryx-btn-lg)', ['borderRadius', 'height', 'padding', 'fontSize', 'fontWeight', 'borderTopWidth']],
  'button lg (.oryx-btn-lg)': ['.oryx-btn-lg', ['borderRadius', 'height', 'padding', 'fontSize']],
  'primary (.oryx-btn-primary)': ['.oryx-btn-primary:not(.oryx-btn-lg)', ['borderRadius', 'height', 'padding', 'fontSize', 'fontWeight', 'backgroundImage']],
  'input (.oryx-input)': ['.oryx-input', ['borderRadius', 'height', 'padding', 'fontSize', 'backgroundColor', 'borderTopWidth']],
  'select (.oryx-select)': ['.oryx-select', ['borderRadius', 'height', 'padding', 'fontSize', 'backgroundColor']],
  'table th': ['.oryx-table th', ['fontSize', 'fontWeight', 'textTransform', 'padding', 'color', 'backgroundColor']],
  'table td': ['.oryx-table td', ['fontSize', 'padding', 'color', 'borderTopColor']],
  'badge (.oryx-badge)': ['.oryx-badge', ['borderRadius', 'fontSize', 'fontWeight', 'padding']],
  'nav link': ['.oryx-nav a', ['fontSize', 'fontWeight', 'borderRadius', 'padding']],
  'section title': ['.oryx-section-title', ['fontSize', 'fontWeight', 'color']],
  'card title': ['.oryx-card-title', ['fontSize', 'fontWeight', 'color']],
  'muted text': ['.oryx-muted', ['color', 'fontSize']],
  'eyebrow': ['.oryx-eyebrow', ['color', 'fontSize', 'fontWeight', 'letterSpacing']],
  'page header title': ['.oryx-page-head h1, .oryx-page-head__title', ['fontSize', 'fontWeight', 'color']],
  'label (.oryx-label)': ['.oryx-label', ['fontSize', 'fontWeight', 'color']],
  'link accent': ['.oryx-link', ['color', 'fontWeight']],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate((l) => window.localStorage.setItem('oryx.customer.locale', l), LOCALE);
await page.evaluate((t) => window.localStorage.setItem('oryx.customer.theme', t), THEME);
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });
await page.waitForTimeout(1000);

/** selector -> property -> value -> surfaces[] */
const seen = {};
for (const key of Object.keys(GROUPS)) seen[key] = {};

for (const path of PATHS) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  // Park the pointer off-canvas: a click on the previous page leaves the cursor
  // over whatever now sits at those coordinates, and `:hover` changes the
  // button gradient, which the audit then reports as an inconsistency.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(120);
  for (const [key, [sel, props]] of Object.entries(GROUPS)) {
    const found = await page.evaluate(
      ({ sel, props }) => {
        const out = [];
        for (const el of document.querySelectorAll(sel)) {
          // Skip anything not rendered: a `display:none` control reports the
          // initial value for every property (`height: auto`, `padding: 0`),
          // which the audit would otherwise report as a second design value.
          const box = el.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          const cs = getComputedStyle(el);
          const rec = {};
          for (const p of props) rec[p] = cs[p];
          out.push(rec);
        }
        return out;
      },
      { sel, props },
    );
    for (const rec of found) {
      for (const [p, v] of Object.entries(rec)) {
        seen[key][p] ??= {};
        seen[key][p][v] ??= new Set();
        seen[key][p][v].add(path);
      }
    }
  }
}

let defects = 0;
console.log(`\n=== component consistency: ${THEME} / ${LOCALE} ===`);
for (const [key, props] of Object.entries(seen)) {
  const lines = [];
  for (const [p, values] of Object.entries(props)) {
    const vals = Object.keys(values);
    if (vals.length > 1) {
      lines.push(`  ${p}: ${vals.length} values`);
      for (const v of vals) lines.push(`      ${v}   <- ${[...values[v]].join(' ')}`);
    }
  }
  if (lines.length) {
    defects += 1;
    console.log(`\n[INCONSISTENT] ${key}`);
    console.log(lines.join('\n'));
  }
}
if (!defects) console.log('\nno inconsistent component properties found');

await browser.close();
