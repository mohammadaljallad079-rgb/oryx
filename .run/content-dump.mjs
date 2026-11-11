/**
 * Dump the main content region (excluding the sidebar) for each enterprise route.
 *
 * A byte-identical screenshot across routes means the content area rendered the
 * same thing, which is either a loading state or a real defect. This prints the
 * content text so the cause is visible.
 */
import { chromium } from 'playwright';

const BASE = 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const EMAIL = 'admin@oryx-auto.local';
const PASSWORD = 'ChangeMe!Oryx2026';

const ROUTES = [
  '/dashboard', '/accounting', '/sales', '/inventory', '/purchasing', '/hr', '/crm',
  '/automotive/maintenance', '/automotive/inspections', '/automotive/spare-parts',
  '/providers', '/bookings', '/payments', '/operations', '/reports',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-SA' });
const page = await ctx.newPage();

const failures = [];
page.on('response', (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
});

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
await page.locator('[data-testid="login-email"]').fill(EMAIL);
await page.locator('[data-testid="login-password"]').fill(PASSWORD);
await page.locator('[data-testid="login-submit"]').click();
await page.waitForURL('**/dashboard', { timeout: 60000 });

for (const route of ROUTES) {
  failures.length = 0;
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const main = await page.evaluate(() => {
    const el = document.querySelector('main') ?? document.querySelector('.oryx-main') ?? document.body;
    return (el.innerText || '').replace(/\s+/g, ' ').trim();
  });
  const url = page.url();
  console.log(`\n=== ${route} -> ${url} (${main.length} chars) ===`);
  console.log(main.slice(0, 260));
  if (failures.length) console.log('  HTTP:', [...new Set(failures)].join(', '));
}

await browser.close();
