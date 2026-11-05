/**
 * Capture the twelve acceptance surfaces the handover brief names, over the
 * public HTTPS preview. Each capture is a real signed-in navigation, so a
 * screenshot only exists if the surface actually rendered with its data.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const ADMIN = 'https://work-1-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const CUSTOMER = 'https://work-2-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const OUT = '/workspace/project/oryx/.run/evidence/final-acceptance';
mkdirSync(OUT, { recursive: true });

const results = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
const page = await ctx.newPage();

async function signIn(base, email, password) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('[data-testid="login-email"]').fill(email);
  await page.locator('[data-testid="login-password"]').fill(password);
  await page.locator('[data-testid="login-password"]').press('Enter');
  await page.waitForURL('**/dashboard', { timeout: 90000 });
  await page.waitForTimeout(1500);
}

async function shot(label, url, selector) {
  const entry = { label, url, ok: false };
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2500);
    if (selector) await page.locator(selector).first().waitFor({ timeout: 20000 });
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();
    entry.chars = text.length;
    entry.title = await page.title();
    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
    entry.ok = text.length > 120;
  } catch (e) {
    entry.error = String(e).slice(0, 160);
  }
  results.push(entry);
  console.log(`${entry.ok ? 'OK  ' : 'FAIL'} ${label} (${entry.chars ?? 0} chars) ${entry.url}`);
}

await signIn(ADMIN, 'superadmin@oryx.local', 'ChangeMe!Oryx2026');
await shot('01-admin-dashboard', `${ADMIN}/dashboard`, '[data-testid="dashboard-hero"]');
await shot('06-document-register', `${ADMIN}/documents`, '[data-testid="document-register"], main');
await shot('05-merchant-interface', `${ADMIN}/providers`, 'main');
await shot('07-sales-invoice', `${ADMIN}/sales`, 'main');
await shot('09-purchase-invoice', `${ADMIN}/purchasing`, 'main');
await shot('10-inspection-engine', `${ADMIN}/automotive/inspections`, 'main');

// Customer surfaces: the session cookie carries across a full navigation.
await signIn(CUSTOMER, 'customer@oryx-demo.local', 'OryxDemo!2026');
await shot('02-customer-website', `${CUSTOMER}/`, 'main');
await shot('03-products', `${CUSTOMER}/products`, 'main');
await shot('04-services', `${CUSTOMER}/services`, 'main');
await shot('12-qr-verification', `${CUSTOMER}/verify/2tkWpHtMu072IskrFDl46XiTVysMcXZoGWoiDrfGnsQ`, 'main');

writeFileSync(`${OUT}/index.json`, JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\ncaptured ${results.length}, failed ${failed}`);
process.exit(failed ? 1 : 0);
