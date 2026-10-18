/**
 * Execution 07 Phase A — captures the CURRENT (before) state of the four
 * representative surfaces so the redesign has an evidence baseline.
 *
 * Mirrors the proven flow in .run/capture-public.mjs (test-ids, per-user
 * context, preference keys applied after landing on the origin).
 *
 * Run with: node .run/capture-exec07-before.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const ADMIN = 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const OUT = 'docs/audit/exec07/before';

const SUPER_ADMIN = { email: 'superadmin@oryx.local', password: 'ChangeMe!Oryx2026' };
const ENTERPRISE = { email: 'admin@oryx-auto.local', password: 'ChangeMe!Oryx2026' };
const CUSTOMER_USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const ADMIN_KEYS = { locale: 'oryx.locale', theme: 'oryx.theme' };
const CUSTOMER_KEYS = { locale: 'oryx.customer.locale', theme: 'oryx.customer.theme' };

mkdirSync(OUT, { recursive: true });

async function adminSignIn(page, creds) {
  await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email').fill(creds.email);
  await page.getByTestId('login-password').fill(creds.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 45_000 });
}

async function customerSignIn(page, creds) {
  await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(5000);
}

async function applyPrefs(page, locale, theme, base, keys) {
  if (new URL(page.url()).origin === 'null') {
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  }
  await page.evaluate(
    ([l, t, localeKey, themeKey]) => {
      window.localStorage.setItem(localeKey, l);
      window.localStorage.setItem(themeKey, t);
    },
    [locale, theme, keys.locale, keys.theme],
  );
}

async function shot(page, name, path) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`shot ${name}  ${path}`);
}

const ADMIN_SHOTS = [
  ['01-super-admin-dashboard', '/dashboard', SUPER_ADMIN, 'ar', 'dark'],
  ['02-tenant-erp-dashboard', '/dashboard', ENTERPRISE, 'en', 'dark'],
  ['03-accounting', '/accounting', ENTERPRISE, 'en', 'dark'],
];
const CUSTOMER_SHOTS = [
  ['04-public-homepage', '/', null, 'ar', 'dark'],
  ['05-customer-dashboard', '/dashboard', CUSTOMER_USER, 'en', 'dark'],
];

const browser = await chromium.launch();

async function captureGroup(shots, base, viewport, signIn, keys) {
  const groups = new Map();
  for (const s of shots) {
    const key = s[2] ? s[2].email : '__anon__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  for (const [key, group] of groups) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    if (key !== '__anon__') await signIn(page, group[0][2]);
    for (const [name, path, , locale, theme] of group) {
      await applyPrefs(page, locale, theme, base, keys);
      await shot(page, name, `${base}${path}`);
    }
    await ctx.close();
  }
}

await captureGroup(ADMIN_SHOTS, ADMIN, { width: 1536, height: 1024 }, adminSignIn, ADMIN_KEYS);
await captureGroup(CUSTOMER_SHOTS, CUSTOMER, { width: 1440, height: 1024 }, customerSignIn, CUSTOMER_KEYS);

await browser.close();
console.log('done ->', OUT);
