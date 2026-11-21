/**
 * Verify the customer website and the mobile web preview over public HTTPS.
 *
 * The customer site authenticates against the consumer identity plane and keeps
 * the access token in memory. A per-screen URL reload therefore drops it, so the
 * authenticated checks sign in once and navigate with the app's own links. The
 * anonymous checks can reload freely.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const OUT = process.env.OUT_DIR ?? '/workspace/project/oryx/.run/evidence/final-sweep';
const CUSTOMER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

const ANON = [
  ['cust-01-website', '/'],
  ['cust-02-services', '/services'],
  ['cust-03-provider-directory', '/providers'],
  ['cust-04-login', '/login'],
  ['cust-05-register', '/register'],
  ['cust-06-provider-apply', '/providers/apply'],
];

const AUTH = [
  ['cust-07-dashboard', '/dashboard', 'لوحة|Dashboard|مرحب'],
  ['cust-08-garage', '/garage', 'مركبات|Garage|مرآب'],
  ['cust-09-bookings', '/bookings', 'حجز|Booking'],
  ['cust-10-invoices', '/invoices', 'فاتور|Invoice'],
  ['cust-11-support', '/support', 'دعم|Support'],
  ['cust-12-profile', '/profile', ''],
];

function watch(page) {
  const failures = [];
  const consoleErrors = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  return { failures, consoleErrors };
}

async function shoot(page, label, route, entry, heading) {
  const main = await page.evaluate(() => {
    const el = document.querySelector('main') ?? document.body;
    return (el.innerText || '').replace(/\s+/g, ' ').trim();
  });
  entry.url = page.url();
  entry.dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
  entry.theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  entry.contentLength = main.length;
  entry.headingPresent = heading ? new RegExp(heading).test(main) : true;
  entry.excerpt = main.slice(0, 180);
  entry.ok = main.length > 40 && entry.headingPresent;
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
}

// --------------------------------------------------------------- anonymous
for (const [label, route] of ANON) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-SA' });
  const page = await ctx.newPage();
  const { failures, consoleErrors } = watch(page);
  const entry = { label, route, ok: false };
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1000);
    await shoot(page, label, route, entry, null);
  } catch (err) {
    entry.error = String(err).slice(0, 200);
  }
  entry.failures = [...new Set(failures)];
  entry.consoleErrors = [...new Set(consoleErrors)].slice(0, 5);
  report.push(entry);
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${label} ${route} (${entry.contentLength ?? 0} chars)`);
  await ctx.close();
}

// ------------------------------------------------------------- authenticated
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-SA' });
  const page = await ctx.newPage();
  const { failures, consoleErrors } = watch(page);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('input[type="email"]').first().fill(CUSTOMER.email);
  await page.locator('input[type="password"]').first().fill(CUSTOMER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3500);

  for (const [label, route, heading] of AUTH) {
    const entry = { label, route, ok: false };
    try {
      // Navigate inside the app so the in-memory access token survives.
      await page.evaluate((r) => {
        window.history.pushState({}, '', r);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
      await page.waitForTimeout(2500);
      await shoot(page, label, route, entry, heading);
    } catch (err) {
      entry.error = String(err).slice(0, 200);
    }
    entry.failures = [...new Set(failures)];
    report.push(entry);
    console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${label} ${route} -> ${entry.url} (${entry.contentLength ?? 0} chars)`);
  }
  await ctx.close();
}

// -------------------------------------------------------------------- mobile
for (const [label, route] of [
  ['mobile-01-login', '/mobile/login'],
  ['mobile-02-home', '/mobile/'],
  ['mobile-03-services', '/mobile/services'],
]) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    locale: 'ar-SA',
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const { failures, consoleErrors } = watch(page);
  const entry = { label, route, ok: false };
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2500);
    await shoot(page, label, route, entry, null);
  } catch (err) {
    entry.error = String(err).slice(0, 200);
  }
  entry.failures = [...new Set(failures)];
  entry.consoleErrors = [...new Set(consoleErrors)].slice(0, 5);
  report.push(entry);
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${label} ${route} (${entry.contentLength ?? 0} chars)`);
  await ctx.close();
}

writeFileSync(`${OUT}/customer-mobile-report.json`, JSON.stringify(report, null, 2));
console.log(`\nWrote ${report.length} entries`);
await browser.close();
