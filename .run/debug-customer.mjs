// Debug the customer sign-in against the public preview.
import { chromium } from 'playwright';

const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.request().method(), r.url()); });

await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('[data-testid="login-email"]').fill('customer@oryx-demo.local');
await page.locator('[data-testid="login-password"]').fill('OryxDemo!2026');
const btn = page.locator('button[type="submit"]').first();
console.log('submit count:', await page.locator('button[type="submit"]').count(), 'visible:', await btn.isVisible());
await btn.click();
await page.waitForTimeout(8000);
console.log('url after submit:', page.url());
console.log('body text sample:', (await page.locator('body').innerText()).slice(0, 400));
await browser.close();
