/** Probe the admin sign-in flow: what happens after submit? */
import { chromium } from 'playwright';

const ADMIN = process.env.ORYX_ADMIN_BASE ?? 'http://127.0.0.1:12000';
const USER = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('console', (m) => console.log('  [console]', m.type(), m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/auth/') || u.includes('/api/')) console.log(`  [net] ${r.status()} ${u.slice(0, 120)}`);
});

await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);
console.log('login page url:', page.url());

const inputs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('input')).map((i) => ({
    type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
  })),
);
console.log('inputs:', JSON.stringify(inputs));

await page.locator('input[type="email"], input[name="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(6000);
console.log('after submit url:', page.url());
const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('body text:', body.replace(/\n+/g, ' | ').slice(0, 400));

await browser.close();
