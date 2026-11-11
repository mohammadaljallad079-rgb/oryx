/**
 * Confirms the customer preview shots are authenticated, not login screens.
 * Prints a short text fingerprint of each target over the public ingress.
 *
 * Run with: node .run/check-customer-text.mjs
 */
import { chromium } from 'playwright';

const C = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const creds = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
await ctx.addInitScript(() => {
  localStorage.setItem('oryx.customer.locale', 'en');
  localStorage.setItem('oryx.customer.theme', 'dark');
});
const page = await ctx.newPage();

await page.goto(`${C}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').first().fill(creds.email);
await page.locator('input[type="password"]').first().fill(creds.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(6000);

for (const path of ['/', '/dashboard', '/garage', '/bookings', '/invoices', '/profile']) {
  await page.goto(`${C}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2800);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  const isLogin = /sign in|password/i.test(text) && text.length < 400;
  console.log(`${path.padEnd(12)} ${isLogin ? 'LOGIN-SCREEN' : 'authenticated '} ${text.slice(0, 130)}`);
}

await browser.close();
