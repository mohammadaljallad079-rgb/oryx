/**
 * Capture every ORYX admin module over the public HTTPS preview.
 *
 * Logs in once, then navigates inside the app (a reload would drop the in-memory
 * access token). For each route it records the HTTP failures, console errors and
 * a screenshot, so the audit can report what actually rendered.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PREVIEW_URL ?? 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const OUT = process.env.OUT_DIR ?? '/workspace/project/oryx/docs/audit/screenshots';
const LOCALE = process.env.PREVIEW_LOCALE ?? 'ar';
const THEME = process.env.PREVIEW_THEME ?? 'dark';

const ACCOUNTS = {
  superadmin: { email: 'superadmin@oryx.local', password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026' },
  enterprise: { email: 'admin@oryx-auto.local', password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026' },
};

const ROUTES = [
  ['01-super-admin-dashboard', '/dashboard', 'superadmin'],
  ['02-companies', '/companies', 'superadmin'],
  ['03-subscriptions', '/subscriptions', 'superadmin'],
  ['04-users-roles', '/users', 'superadmin'],
  ['05-audit-trail', '/audit', 'superadmin'],
  ['06-integrations-center', '/integrations', 'superadmin'],
  ['07-erp-dashboard', '/dashboard', 'enterprise'],
  ['08-accounting', '/accounting', 'enterprise'],
  ['09-sales-pos', '/sales', 'enterprise'],
  ['10-inventory', '/inventory', 'enterprise'],
  ['11-procurement', '/purchasing', 'enterprise'],
  ['12-hr-payroll', '/hr', 'enterprise'],
  ['13-crm', '/crm', 'enterprise'],
  ['14-automotive-maintenance', '/automotive/maintenance', 'enterprise'],
  ['15-workshop-inspections', '/automotive/inspections', 'enterprise'],
  ['16-spare-parts', '/automotive/spare-parts', 'enterprise'],
  ['17-provider-portal', '/providers', 'enterprise'],
  ['18-bookings', '/bookings', 'enterprise'],
  ['19-payments', '/payments', 'enterprise'],
  ['20-operations', '/operations', 'enterprise'],
  ['21-reports', '/reports', 'enterprise'],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

for (const [label, route, account] of ROUTES) {
  const creds = ACCOUNTS[account];
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: LOCALE === 'ar' ? 'ar-SA' : 'en-GB',
  });
  const page = await ctx.newPage();
  const failures = [];
  const consoleErrors = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

  const entry = { label, route, account, ok: false };
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.locator('[data-testid="login-email"]').fill(creds.email);
    await page.locator('[data-testid="login-password"]').fill(creds.password);
    await page.locator('[data-testid="login-submit"]').click();
    await page.waitForURL('**/dashboard', { timeout: 60000 });

    // Navigate inside the app so the in-memory token survives.
    await page.evaluate((r) => {
      window.history.pushState({}, '', r);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, route);
    await page.waitForTimeout(1200);
    // A soft client-side nav is not guaranteed; fall back to a link click.
    if (!page.url().endsWith(route)) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
      if (page.url().includes('/login')) {
        await page.locator('[data-testid="login-email"]').fill(creds.email);
        await page.locator('[data-testid="login-password"]').fill(creds.password);
        await page.locator('[data-testid="login-submit"]').click();
        await page.waitForURL('**/dashboard', { timeout: 60000 });
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
      }
    }
    await page.waitForTimeout(2500);

    const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    entry.url = page.url();
    entry.title = await page.title();
    entry.dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
    entry.theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    entry.textLength = bodyText.length;
    entry.excerpt = bodyText.slice(0, 220);
    entry.sidebarLogoutVisible = await page
      .locator('[data-testid="sidebar-logout"]')
      .isVisible()
      .catch(() => false);
    entry.ok = !entry.url.includes('/login') && bodyText.length > 40;

    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
  } catch (err) {
    entry.error = String(err).slice(0, 300);
  }
  entry.failures = [...new Set(failures)];
  entry.consoleErrors = [...new Set(consoleErrors)].slice(0, 5);
  report.push(entry);
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${label} ${route} -> ${entry.url ?? entry.error}`);
  await ctx.close();
}

writeFileSync(`${OUT}/capture-report.json`, JSON.stringify(report, null, 2));
console.log(`\nWrote ${report.length} entries to ${OUT}/capture-report.json`);
await browser.close();
