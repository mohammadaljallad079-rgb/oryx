/**
 * Captures the owner-facing preview screenshots through the public HTTPS
 * ingress, exactly as a reviewer's browser would see them.
 *
 * Unlike the Playwright suite this does not run the MFA reset fixture and does
 * not touch localhost: it logs in over the public URL so the shots prove the
 * deployed preview works end to end, not just the local build.
 *
 * Run with: node .run/capture-public.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const ADMIN = 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const OUT = 'docs/audit/branding/public';

const SUPER_ADMIN = { email: 'superadmin@oryx.local', password: 'ChangeMe!Oryx2026' };
const ENTERPRISE = { email: 'admin@oryx-auto.local', password: 'ChangeMe!Oryx2026' };
const CUSTOMER_USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

// The fourteen preview surfaces the owner asked to inspect.
const ADMIN_SHOTS = [
  ['01-super-admin-dashboard', '/dashboard', SUPER_ADMIN, 'ar', 'dark'],
  ['02-company-erp-dashboard', '/dashboard', ENTERPRISE, 'en', 'dark'],
  ['03-accounting', '/accounting', ENTERPRISE, 'en', 'dark'],
  ['04-sales-pos', '/sales', ENTERPRISE, 'en', 'dark'],
  ['05-inventory', '/inventory', ENTERPRISE, 'en', 'dark'],
  ['06-procurement', '/purchasing', ENTERPRISE, 'en', 'dark'],
  ['07-hr-payroll', '/hr', ENTERPRISE, 'en', 'dark'],
  ['08-crm', '/crm', ENTERPRISE, 'en', 'dark'],
  ['09-automotive-operations', '/automotive/inspections', ENTERPRISE, 'en', 'dark'],
  ['10-workshop-maintenance', '/automotive/maintenance', ENTERPRISE, 'en', 'dark'],
  ['11-provider-portal', '/providers', ENTERPRISE, 'en', 'dark'],
  ['13-integrations-center', '/integrations', SUPER_ADMIN, 'en', 'dark'],
];

const CUSTOMER_SHOTS = [
  ['12a-customer-website', '/', CUSTOMER_USER, 'ar', 'dark'],
  ['12b-customer-dashboard', '/dashboard', CUSTOMER_USER, 'en', 'dark'],
];

// The mobile preview is captured by .run/capture-mobile.mjs instead. The Expo
// web export keeps the customer session in memory, so navigating it by URL —
// the way every other shot here works — drops the token and renders the login
// screen. That script signs in once and drives the app's own tab bar.

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
  // localStorage is unavailable on about:blank, so an anonymous context must
  // land on the origin before the preference can be written.
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
  // Wait for the app's own data fetches to settle; a fixed pause alone can
  // capture a skeleton or a redirect frame.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3200);
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  const status = await page.title();
  console.log(`shot ${name.padEnd(30)} ${path}  title="${status.slice(0, 40)}"`);
}

const browser = await chromium.launch();

/**
 * Each credential gets its own browser context. Reusing one context across
 * users does not work: the app redirects an authenticated session away from
 * /login, so the second sign-in finds a detached form.
 */
async function captureGroup(shots, base, viewport, signIn, keys) {
  const groups = new Map();
  for (const shot of shots) {
    const key = shot[2] ? shot[2].email : '__anon__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shot);
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

// The two apps keep their UI preferences under different localStorage keys.
const ADMIN_KEYS = { locale: 'oryx.locale', theme: 'oryx.theme' };
const CUSTOMER_KEYS = { locale: 'oryx.customer.locale', theme: 'oryx.customer.theme' };

await captureGroup(ADMIN_SHOTS, ADMIN, { width: 1536, height: 1024 }, adminSignIn, ADMIN_KEYS);
await captureGroup(CUSTOMER_SHOTS, CUSTOMER, { width: 1440, height: 1024 }, customerSignIn, CUSTOMER_KEYS);

await browser.close();
console.log(`\nwrote ${ADMIN_SHOTS.length + CUSTOMER_SHOTS.length} screenshots to ${OUT}`);
console.log('mobile screenshots come from .run/capture-mobile.mjs');
