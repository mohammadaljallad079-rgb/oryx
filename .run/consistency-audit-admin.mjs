/**
 * Consistency audit for the admin light theme.
 *
 * The customer-site audit (`.run/consistency-audit.mjs`) proves the storefront
 * reads as one system. The owner's correction landed in the admin control plane,
 * so the same question has to be asked there: does a button, a card, a form
 * field, a table row or a nav item render the *same* on every admin surface, or
 * does one page carry its own radius, height or grey?
 *
 * Walks the six control-plane surfaces in one theme and reports, per component
 * class, the distinct values of the properties that make a system look like one
 * system. More than one value is printed as a defect.
 *
 * Usage: node .run/consistency-audit-admin.mjs [light|dark] [en|ar]
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_ADMIN_URL ?? 'http://127.0.0.1:12000';
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light';
const LOCALE = process.argv[3] ?? 'en';
const USER = {
  email: process.env.ORYX_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.ORYX_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const PATHS = ['/dashboard', '/settings', '/companies', '/users', '/providers', '/audit'];

// component selector -> properties that should be uniform across surfaces
//
// Variants and states are measured as their own groups. Pooling `.oryx-btn--sm`
// with the standard button, or the active nav item with a resting one, reports
// a deliberate difference as a defect — the same false positive the customer
// audit had to correct.
const GROUPS = {
  'card (.oryx-card)': ['.oryx-card', ['borderRadius', 'borderTopWidth', 'backgroundColor']],
  'button (.oryx-btn)': ['.oryx-btn:not(.oryx-btn--primary):not(.oryx-btn--ghost):not(.oryx-btn--sm):not(.oryx-btn--danger)', ['borderRadius', 'height', 'padding', 'fontSize', 'fontWeight']],
  'button sm (.oryx-btn--sm)': ['.oryx-btn--sm', ['borderRadius', 'height', 'padding', 'fontSize']],
  'primary (.oryx-btn--primary)': ['.oryx-btn--primary:not(.oryx-btn--sm)', ['borderRadius', 'height', 'padding', 'fontSize', 'fontWeight']],
  'ghost (.oryx-btn--ghost)': ['.oryx-btn--ghost', ['borderRadius', 'height', 'padding', 'fontSize']],
  'input (.oryx-input)': ['.oryx-input:not(:has(+ button))', ['borderRadius', 'height', 'padding', 'fontSize', 'backgroundColor', 'borderTopWidth']],
  // PasswordField reserves trailing space for its show/hide toggle, so it is a
  // deliberate variant rather than a second input design.
  'input with toggle': ['.oryx-input:has(+ button)', ['borderRadius', 'height', 'fontSize', 'backgroundColor']],
  'select (.oryx-select)': ['.oryx-select', ['borderRadius', 'height', 'padding', 'fontSize', 'backgroundColor']],
  'textarea (.oryx-textarea)': ['.oryx-textarea', ['borderRadius', 'padding', 'fontSize', 'backgroundColor']],
  'table th': ['.oryx-table th', ['fontSize', 'fontWeight', 'textTransform', 'padding', 'color']],
  'table td (base)': ['.oryx-table td:not([class*="text-["])', ['fontSize', 'padding', 'color', 'borderTopColor']],
  'badge (.oryx-badge)': ['.oryx-badge', ['borderRadius', 'fontSize', 'fontWeight', 'padding']],
  'nav item (.oryx-nav-item)': ['.oryx-nav-item:not([aria-current="page"])', ['borderRadius', 'fontSize', 'fontWeight', 'padding', 'color']],
  'nav item active': ['.oryx-nav-item[aria-current="page"]', ['borderRadius', 'fontSize', 'fontWeight', 'padding', 'color']],
  'label (.oryx-label)': ['.oryx-label', ['fontSize', 'fontWeight', 'color']],
  'muted (.oryx-muted)': ['.oryx-muted', ['color']],
  'panel title (.oryx-panel-title)': ['.oryx-panel-title', ['fontSize', 'fontWeight', 'color']],
  'kpi value (.oryx-kpi-value)': ['.oryx-kpi-value', ['fontSize', 'fontWeight', 'color']],
  'kpi label (.oryx-kpi-label)': ['.oryx-kpi-label', ['fontSize', 'fontWeight', 'color']],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(
  ([t, l]) => {
    window.localStorage.setItem('oryx.theme', t);
    window.localStorage.setItem('oryx.locale', l);
  },
  [THEME, LOCALE],
);
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 60_000 });
await page.waitForTimeout(1500);

/** selector -> property -> value -> surfaces[] */
const seen = {};

for (const path of PATHS) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
  // Park the pointer so a lingering :hover does not read as a second design.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);

  for (const [group, [selector, props]] of Object.entries(GROUPS)) {
    const rows = await page.$$eval(selector, (els, propList) => {
      const out = [];
      for (const el of els) {
        const box = el.getBoundingClientRect();
        // A zero-area box means the control is hidden; it reports initial
        // values for every property and would fabricate a defect.
        if (box.width < 1 || box.height < 1) continue;
        const cs = getComputedStyle(el);
        const rec = {};
        for (const p of propList) rec[p] = cs[p];
        out.push(rec);
      }
      return out;
    }, props);
    for (const rec of rows) {
      for (const [p, v] of Object.entries(rec)) {
        seen[group] ??= {};
        seen[group][p] ??= {};
        seen[group][p][v] ??= [];
        if (!seen[group][p][v].includes(path)) seen[group][p][v].push(path);
      }
    }
  }
}

await browser.close();

console.log(`\n=== admin component consistency: ${THEME} / ${LOCALE} ===\n`);
let defects = 0;
for (const [group, props] of Object.entries(seen)) {
  for (const [prop, values] of Object.entries(props)) {
    const keys = Object.keys(values);
    if (keys.length <= 1) continue;
    defects += 1;
    console.log(`[INCONSISTENT] ${group}`);
    console.log(`  ${prop}: ${keys.length} values`);
    for (const k of keys) console.log(`      ${k}   <- ${values[k].join(' ')}`);
    console.log('');
  }
}
if (!defects) console.log('no inconsistent component properties found');
console.log(`\n${defects} inconsistent propert${defects === 1 ? 'y' : 'ies'}`);
process.exit(defects ? 1 : 0);
