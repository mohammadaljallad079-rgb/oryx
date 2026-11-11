/**
 * Separate the pre-login refresh 404 from the post-login one.
 *
 * The customer refresh cookie is scoped to /api/v1/customer, so the first
 * anonymous page load has no cookie and the app's session probe is refused.
 * That is expected. What matters is whether the probe also fails *after* a
 * session exists, because then the session would not restore.
 */
import { chromium } from 'playwright';

const BASE = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-SA' });
const page = await ctx.newPage();

let phase = 'anonymous';
const seen = [];
page.on('response', (r) => {
  const p = new URL(r.url()).pathname;
  if (p.includes('/customer/auth/')) seen.push(`${phase} ${r.status()} ${r.request().method()} ${p}`);
});

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(2000);

phase = 'login-submit';
await page.locator('input[type="email"]').first().fill('customer@oryx-demo.local');
await page.locator('input[type="password"]').first().fill('OryxDemo!2026');
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 60000 });
await page.waitForTimeout(2500);

phase = 'reload-authenticated';
await page.goto(`${BASE}/garage`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

console.log('customer auth calls observed:');
for (const s of seen) console.log('   ', s);
console.log('\nfinal url:', page.url());
await browser.close();
