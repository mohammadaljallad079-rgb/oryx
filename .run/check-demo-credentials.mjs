/**
 * Prove the documented demo credentials actually sign in on the live preview.
 * A preview link whose credentials fail is not a deliverable.
 */
import { chromium } from 'playwright';

const ADMIN = 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';

const accounts = [
  ['Super Admin', ADMIN, { email: 'superadmin@oryx.local', password: 'ChangeMe!Oryx2026' }, '/dashboard', 'staff'],
  ['Enterprise tenant admin', ADMIN, { email: 'admin@oryx-auto.local', password: 'ChangeMe!Oryx2026' }, '/dashboard', 'staff'],
  ['Demo SaaS tenant admin', ADMIN, { email: 'admin@demo-alnoor.local', password: 'ChangeMe!Oryx2026' }, '/dashboard', 'staff'],
  ['Demo consumer', CUSTOMER, { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' }, '/dashboard', 'customer'],
];

const browser = await chromium.launch();
const failures = [];
for (const [name, base, creds, expectPath, kind] of accounts) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
    if (kind === 'staff') {
      await page.getByTestId('login-email').fill(creds.email);
      await page.getByTestId('login-password').fill(creds.password);
      await page.getByTestId('login-submit').click();
    } else {
      await page.locator('input[type="email"]').first().fill(creds.email);
      await page.locator('input[type="password"]').first().fill(creds.password);
      await page.locator('button[type="submit"]').first().click();
    }
    await page.waitForURL(`**${expectPath}`, { timeout: 45_000 });
    // A rendered page, not just a URL change: the session must actually hold.
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    const ok = body.length > 200 && !/sign in|تسجيل الدخول/i.test(body.slice(0, 120));
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} -> ${page.url()}`);
    if (!ok) failures.push(name);
  } catch (e) {
    console.log(`  FAIL  ${name}  ${e.message.split('\n')[0]}`);
    failures.push(name);
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
