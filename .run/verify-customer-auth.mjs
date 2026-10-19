/**
 * Verify the authenticated customer screens over public HTTPS.
 *
 * The customer site restores its session from the HttpOnly refresh cookie on
 * mount (apps/customer/src/lib/auth-context.tsx), so a full navigation per route
 * is the correct method: each load re-establishes the session and the guarded
 * screen renders its real content. This is different from the mobile web export,
 * whose session is in memory only.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const OUT = process.env.OUT_DIR ?? '/workspace/project/oryx/.run/evidence/final-sweep';
const CUSTOMER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const ROUTES = [
  ['cust-07-dashboard', '/dashboard', 'مرحبًا'],
  ['cust-08-garage', '/garage', ''],
  ['cust-09-bookings', '/bookings', ''],
  ['cust-10-invoices', '/invoices', ''],
  ['cust-11-support', '/support', ''],
  ['cust-12-profile', '/profile', ''],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

for (const [label, route, heading] of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-SA' });
  const page = await ctx.newPage();
  const failures = [];
  const consoleErrors = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });

  const entry = { label, route, ok: false };
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.locator('input[type="email"]').first().fill(CUSTOMER.email);
    await page.locator('input[type="password"]').first().fill(CUSTOMER.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/dashboard', { timeout: 60000 });

    // Full navigation: the cookie restores the session on mount.
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);

    const main = await page.evaluate(() => {
      const el = document.querySelector('main') ?? document.body;
      return (el.innerText || '').replace(/\s+/g, ' ').trim();
    });
    entry.url = page.url();
    entry.contentLength = main.length;
    entry.headingPresent = heading ? main.includes(heading) : true;
    entry.excerpt = main.slice(0, 200);
    entry.ok = !entry.url.includes('/login') && main.length > 60 && entry.headingPresent;
    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
  } catch (err) {
    entry.error = String(err).slice(0, 200);
  }
  entry.failures = [...new Set(failures)];
  entry.consoleErrors = [...new Set(consoleErrors)].slice(0, 5);
  report.push(entry);
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${label} ${route} -> ${entry.url} (${entry.contentLength ?? 0} chars)`);
  await ctx.close();
}

writeFileSync(`${OUT}/customer-auth-report.json`, JSON.stringify(report, null, 2));
await browser.close();
