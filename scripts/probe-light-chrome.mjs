/**
 * Execution 07 Phase E — probe the *computed* light-theme chrome of both apps.
 *
 * The owner's complaint was that the light theme "looks inconsistent". The
 * meaningful question is what colour the browser actually resolves for the
 * shared surfaces, not what a screenshot average looks like. This reads
 * `getComputedStyle` for the page, the raised surface and a card in the admin
 * control plane and the customer site, and asserts they agree with
 * `LIGHT_THEME`. It also reports the accent, so a stray gold cannot hide.
 *
 * Usage: node scripts/probe-light-chrome.mjs
 */

import { chromium } from 'playwright';
import { LIGHT_THEME } from '../packages/shared/dist/tokens.js';

const ADMIN = process.env.ORYX_ADMIN_BASE ?? 'http://127.0.0.1:12000';
const CUSTOMER = process.env.ORYX_CUSTOMER_BASE ?? 'http://localhost:3002';
const ADMIN_USER = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};
const CUSTOMER_USER = {
  email: process.env.ORYX_CUSTOMER_EMAIL ?? 'rider@oryx.local',
  password: process.env.ORYX_CUSTOMER_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const PROBE = `(() => {
  const read = (sel, prop) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el)[prop] : null;
  };
  return {
    pageBg: read('body', 'backgroundColor'),
    pageFg: read('body', 'color'),
    htmlTheme: document.documentElement.getAttribute('data-theme'),
  };
})()`;

function rgbToHex(value) {
  if (!value) return null;
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return value;
  return '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('');
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/usr/bin/chromium' });
  }
}

const browser = await launch();
const failures = [];
const rows = [];

async function probe(app, base, path, user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(
    `(() => { try { localStorage.setItem(${JSON.stringify(app === 'admin' ? 'oryx.theme' : 'oryx.customer.theme')}, 'light'); } catch {} })();`,
  );
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const email = page.locator('input[name="email"], [data-testid="login-email"]').first();
  const pass = page.locator('input[type="password"], [data-testid="login-password"]').first();
  if (await email.count()) {
    await email.fill(user.email);
    await pass.fill(user.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3500);
  }
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
  const got = await page.evaluate(PROBE);
  await ctx.close();

  const row = {
    app,
    surface: path,
    theme: got.htmlTheme,
    pageBg: rgbToHex(got.pageBg),
    pageFg: rgbToHex(got.pageFg),
  };
  rows.push(row);
  if (got.htmlTheme !== 'light') failures.push(`${app}${path}: data-theme=${got.htmlTheme}`);
  if (row.pageBg !== LIGHT_THEME.background.toLowerCase())
    failures.push(`${app}${path}: page bg ${row.pageBg} != ${LIGHT_THEME.background}`);
  if (row.pageFg !== LIGHT_THEME.text.toLowerCase())
    failures.push(`${app}${path}: page fg ${row.pageFg} != ${LIGHT_THEME.text}`);
}

await probe('admin', ADMIN, '/dashboard', ADMIN_USER);
await probe('admin', ADMIN, '/companies', ADMIN_USER);
await probe('customer', CUSTOMER, '/', CUSTOMER_USER);
await probe('customer', CUSTOMER, '/providers', CUSTOMER_USER);
await probe('customer', CUSTOMER, '/login', CUSTOMER_USER);
await browser.close();

console.log('app       surface      theme  page bg    page fg    (expected bg/fg from LIGHT_THEME)');
for (const r of rows) {
  console.log(
    `${r.app.padEnd(10)}${r.surface.padEnd(13)}${String(r.theme).padEnd(7)}${String(r.pageBg).padEnd(11)}${String(r.pageFg).padEnd(11)}`,
  );
}
console.log(`\nexpected: ${LIGHT_THEME.background} / ${LIGHT_THEME.text}`);
console.log(`accent:   ${LIGHT_THEME.gold} (text) · ${LIGHT_THEME.goldOnTint} (on tint)`);
if (failures.length) {
  console.log(`\n${failures.length} mismatch(es):`);
  for (const f of failures) console.log(`  ! ${f}`);
  process.exit(1);
}
console.log(`\n${rows.length} surface(s) agree with LIGHT_THEME.`);
