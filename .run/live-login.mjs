import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

const calls = [];
page.on('request', (r) => {
  if (r.url().includes('/auth/')) calls.push(['REQ', r.method(), r.url()]);
});
page.on('response', async (r) => {
  if (r.url().includes('/auth/')) {
    let body = '';
    try { body = (await r.text()).slice(0, 160); } catch {}
    calls.push(['RES', r.status(), r.url(), body]);
  }
});
page.on('console', (m) => { if (m.type() === 'error') calls.push(['CONSOLE-ERR', m.text().slice(0, 160)]); });
page.on('pageerror', (e) => calls.push(['PAGEERR', String(e).slice(0, 160)]));

await page.goto('https://admin.oryxbhr.com/login', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);

// A NON-EXISTENT account, so no real user is ever touched or locked out.
await page.locator('input[type="email"], input[name="email"]').first().fill('probe-nonexistent-xyz@invalid.local');
await page.locator('input[type="password"]').first().fill('abcdefgh1234');
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(6000);

console.log('--- AUTH NETWORK CALLS ---');
for (const c of calls) console.log(c.join(' | '));
console.log('--- PAGE TEXT (after submit) ---');
console.log((await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400));
console.log('--- URL ---', page.url());
await browser.close();
