/**
 * Verify the sidebar sign-out over the public HTTPS preview.
 *
 * Checks the button is visible, that clicking it calls the API, clears the
 * HttpOnly refresh cookie, lands on /login, and that a protected route is then
 * refused.
 */
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_URL ?? 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const EMAIL = process.env.PREVIEW_EMAIL ?? 'superadmin@oryx.local';
const PASSWORD = process.env.PREVIEW_PASSWORD ?? 'ChangeMe!Oryx2026';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
await page.locator('[data-testid="login-email"]').fill(EMAIL);
await page.locator('[data-testid="login-password"]').fill(PASSWORD);
await page.locator('[data-testid="login-submit"]').click();
await page.waitForURL('**/dashboard', { timeout: 60000 });
await page.waitForTimeout(2000);

console.log('=== BEFORE SIGN-OUT ===');
const cookiesBefore = (await ctx.cookies()).map((c) => c.name);
console.log('cookies:', cookiesBefore.join(', '));
const btn = page.locator('[data-testid="sidebar-logout"]');
console.log('sidebar-logout visible:', await btn.isVisible());
console.log('sidebar-logout text:', (await btn.innerText()).trim());
await page.screenshot({ path: '/tmp/oryxprobe/logout-before.png' });

let logoutStatus = 0;
page.on('response', (r) => { if (r.url().includes('/auth/logout')) logoutStatus = r.status(); });

await btn.click();
await page.waitForURL('**/login', { timeout: 30000 });
await page.waitForTimeout(2500);

console.log('=== AFTER SIGN-OUT ===');
console.log('logout API status:', logoutStatus);
console.log('url:', page.url());
const cookiesAfter = (await ctx.cookies()).map((c) => c.name);
console.log('cookies:', cookiesAfter.join(', ') || '(none)');
console.log('oryx_rt present:', cookiesAfter.includes('oryx_rt'));

await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
console.log('protected route after sign-out ->', page.url());

// Arabic RTL / LTR check on the sign-in screen.
for (const loc of ['ar', 'en']) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate((l) => window.localStorage.setItem('oryx.locale', l), loc);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
  console.log(`locale ${loc} -> dir=${dir}`);
  await page.screenshot({ path: `/tmp/oryxprobe/login-${loc}.png` });
}

await browser.close();
