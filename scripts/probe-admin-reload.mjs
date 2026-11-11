/** Does an admin page reload preserve the session (refresh cookie)? */
import { chromium } from 'playwright';

const ADMIN = process.env.ORYX_ADMIN_BASE ?? 'http://127.0.0.1:12000';
const USER = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/auth/')) console.log(`  [net] ${r.status()} ${u.slice(-40)}`);
});

await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.locator('input[name="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(4000);
console.log('after login:', page.url());

const cookies = (await ctx.cookies()).map((c) => `${c.name}@${c.path}`);
console.log('cookies:', cookies.join(', ') || '(none)');

console.log('--- reload /companies ---');
await page.goto(`${ADMIN}/companies`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
console.log('after reload:', page.url());

console.log('--- in-app nav (click) ---');
if (!page.url().includes('/login')) {
  const link = page.locator('a[href="/users"]').first();
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(3000);
    console.log('after click:', page.url());
  } else {
    console.log('no /users link found');
  }
}

await browser.close();
