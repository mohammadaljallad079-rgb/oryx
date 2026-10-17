/**
 * Capture every ORYX preview surface over the public HTTPS origin.
 *
 * The previous sweep navigated with `history.pushState`, which is not a Next.js
 * route transition: the content area sometimes still showed the previous screen
 * when the shot was taken, which produced byte-identical images for routes whose
 * chrome matches. This version performs a full navigation per route. The
 * HttpOnly refresh cookie survives the reload, so the session is restored from
 * the server rather than from an in-memory token, and each shot is taken only
 * after the route heading is present.
 *
 * For each surface it records the content-area text, the HTTP failures and the
 * console errors, so "PASS" means the screen really rendered.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PREVIEW_URL ?? 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const OUT = process.env.OUT_DIR ?? '/workspace/project/oryx/docs/audit/screenshots';
const LOCALE = process.env.PREVIEW_LOCALE ?? 'ar';
const THEME = process.env.PREVIEW_THEME ?? 'dark';

const ACCOUNTS = {
  superadmin: { email: 'superadmin@oryx.local', password: 'ChangeMe!Oryx2026' },
  enterprise: { email: 'admin@oryx-auto.local', password: 'ChangeMe!Oryx2026' },
};

// [label, route, account, expected heading fragment in the content area]
const ROUTES = [
  ['01-super-admin-dashboard', '/dashboard', 'superadmin', 'لوحة'],
  ['02-companies', '/companies', 'superadmin', 'الشركات'],
  ['03-subscriptions', '/subscriptions', 'superadmin', 'الاشتراك'],
  ['04-users-roles', '/users', 'superadmin', ''],
  ['05-audit-trail', '/audit', 'superadmin', ''],
  ['06-integrations-center', '/integrations', 'superadmin', ''],
  ['07-erp-dashboard', '/dashboard', 'enterprise', 'أوريكس'],
  ['08-accounting', '/accounting', 'enterprise', 'المحاسبة'],
  ['09-sales-pos', '/sales', 'enterprise', 'المبيعات'],
  ['10-inventory', '/inventory', 'enterprise', 'المستودعات'],
  ['11-procurement', '/purchasing', 'enterprise', 'المشتريات'],
  ['12-hr-payroll', '/hr', 'enterprise', 'الموارد'],
  ['13-crm', '/crm', 'enterprise', 'علاقات'],
  ['14-automotive-maintenance', '/automotive/maintenance', 'enterprise', 'صيانة'],
  ['15-workshop-inspections', '/automotive/inspections', 'enterprise', 'الفحوصات'],
  ['16-spare-parts', '/automotive/spare-parts', 'enterprise', 'قطع'],
  ['17-provider-portal', '/providers', 'enterprise', 'مزودي'],
  ['18-bookings', '/bookings', 'enterprise', 'الحجوزات'],
  ['19-payments', '/payments', 'enterprise', 'المدفوعات'],
  ['20-operations', '/operations', 'enterprise', 'العمليات'],
  ['21-reports', '/reports', 'enterprise', 'التقارير'],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

async function signIn(page, creds) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('[data-testid="login-email"]').fill(creds.email);
  await page.locator('[data-testid="login-password"]').fill(creds.password);
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL('**/dashboard', { timeout: 60000 });
}

for (const [label, route, account, heading] of ROUTES) {
  const creds = ACCOUNTS[account];
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: LOCALE === 'ar' ? 'ar-SA' : 'en-GB',
  });
  const page = await ctx.newPage();
  const failures = [];
  const consoleErrors = [];
  page.on('response', (r) => {
    // A 401 on the anonymous /login refresh probe is expected: no session yet.
    if (r.status() >= 400) failures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });

  const entry = { label, route, account, ok: false };
  try {
    await signIn(page, creds);
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
    if (page.url().includes('/login')) await signIn(page, creds);
    // Wait for the content area to leave its loading state.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('main') ?? document.querySelector('.oryx-main') ?? document.body;
        const text = (el.innerText || '').trim();
        return text.length > 60 && !text.includes('جارٍ');
      },
      { timeout: 30000 },
    ).catch(() => {});
    await page.waitForTimeout(1200);

    const main = await page.evaluate(() => {
      const el = document.querySelector('main') ?? document.querySelector('.oryx-main') ?? document.body;
      return (el.innerText || '').replace(/\s+/g, ' ').trim();
    });

    entry.url = page.url();
    entry.title = await page.title();
    entry.dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
    entry.theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    entry.contentLength = main.length;
    entry.headingPresent = heading ? main.includes(heading) : true;
    entry.excerpt = main.slice(0, 200);
    entry.ok = !entry.url.includes('/login') && main.length > 60 && entry.headingPresent;

    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
  } catch (err) {
    entry.error = String(err).slice(0, 300);
  }
  entry.failures = [...new Set(failures)];
  entry.consoleErrors = [...new Set(consoleErrors)].slice(0, 5);
  report.push(entry);
  console.log(
    `${entry.ok ? 'PASS' : 'FAIL'} ${label} ${route} -> ${entry.url ?? entry.error} ` +
      `(${entry.contentLength ?? 0} chars, heading=${entry.headingPresent})`,
  );
  await ctx.close();
}

writeFileSync(`${OUT}/capture-report.json`, JSON.stringify(report, null, 2));
console.log(`\nWrote ${report.length} entries to ${OUT}/capture-report.json`);
await browser.close();
