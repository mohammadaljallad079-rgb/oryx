import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_URL ?? 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const EMAIL = process.env.PREVIEW_EMAIL ?? 'superadmin@oryx.local';
const PASSWORD = process.env.PREVIEW_PASSWORD ?? 'ChangeMe!Oryx2026';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('PAGEERR ' + String(e).slice(0, 200)));
const failed = [];
page.on('response', (r) => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
await page.locator('[data-testid="login-email"]').fill(EMAIL);
await page.locator('[data-testid="login-password"]').fill(PASSWORD);
await page.locator('[data-testid="login-submit"]').click();

let landed = 'NO-REDIRECT';
try {
  await page.waitForURL('**/dashboard', { timeout: 60000 });
  landed = page.url();
} catch {
  landed = 'stuck at ' + page.url();
}
await page.waitForTimeout(3000);

console.log('=== RESULT ===');
console.log('landed:', landed);
console.log('dashboard visible:', await page.locator('[data-testid="dashboard"]').isVisible().catch(() => false));
console.log('page title:', await page.title());
console.log('--- failed responses (>=400) ---');
for (const f of [...new Set(failed)].slice(0, 15)) console.log(f);
console.log('--- console errors ---');
for (const e of [...new Set(errors)].slice(0, 10)) console.log(e);

await page.screenshot({ path: '/tmp/oryxprobe/preview-dashboard.png', fullPage: false });
console.log('screenshot: /tmp/oryxprobe/preview-dashboard.png');
await browser.close();
