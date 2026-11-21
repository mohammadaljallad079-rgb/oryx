/** Diagnose the customer login through the preview proxy. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:12001';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/api/')) console.log(`${r.status()} ${u}`);
});
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console:', m.text().slice(0, 200));
});

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.localStorage.setItem('oryx.customer.locale', 'en');
  window.localStorage.setItem('oryx.customer.theme', 'light');
});
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').first().fill('customer@oryx-demo.local');
await page.locator('input[type="password"]').first().fill('OryxDemo!2026');
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(6000);
console.log('landed:', page.url());
const cookies = await ctx.cookies();
console.log('cookies:', cookies.map((c) => `${c.name}@${c.domain}${c.path}`).join(', '));
await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
console.log('after reload:', page.url());
const body = await page.evaluate(() => document.body.innerText.slice(0, 200));
console.log('text:', body.replace(/\n+/g, ' | '));
await browser.close();
