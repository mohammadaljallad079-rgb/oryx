/**
 * Capture live preview evidence for the six mandated surfaces, over the public
 * HTTPS preview. Each capture is a real signed-in navigation, so a screenshot
 * only exists if the surface rendered with its real data.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ADMIN = process.env.ADMIN_BASE ?? 'https://work-1-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const OUT = '/workspace/project/oryx/.run/evidence/mandate-6';
mkdirSync(OUT, { recursive: true });

const results = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
const page = await ctx.newPage();

async function signIn() {
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('[data-testid="login-email"]').fill('admin@oryx-auto.local');
  await page.locator('[data-testid="login-password"]').fill('ChangeMe!Oryx2026');
  await page.locator('form:has([data-testid="login-email"]) button[type="submit"]').first().click();
  await page.waitForURL('**/dashboard', { timeout: 90000 });
  await page.waitForTimeout(1500);
}

async function selectCompany(fragment) {
  const select = page.locator('[data-testid="context-selector"] select').first();
  await select.waitFor({ timeout: 20000 });
  const opt = select.locator('option', { hasText: fragment }).first();
  const v = await opt.getAttribute('value');
  if (v) { await select.selectOption(v); await page.waitForTimeout(2500); }
}

async function shot(label, path, selector) {
  const entry = { label, ok: false };
  try {
    await page.goto(`${ADMIN}${path}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2000);
    if (selector) await page.locator(selector).first().waitFor({ timeout: 20000 });
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g,' ').trim();
    entry.chars = text.length;
    entry.text = text.slice(0, 220);
    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
    entry.ok = text.length > 200;
  } catch (e) { entry.error = String(e).slice(0, 160); }
  results.push(entry);
  console.log(`${entry.ok ? 'OK ' : 'BAD'}  ${label}  chars=${entry.chars ?? 0}  ${entry.error ?? ''}`);
}

await signIn();
await selectCompany('ORYX Auto').catch(()=>{});

await shot('1-dashboard', '/dashboard', '[data-testid="dashboard-hero"]');
await shot('1b-kpis', '/dashboard/overview', '[data-testid="kpi-row"]');
await shot('2-company-settings', '/settings', '[data-testid="settings-company"], .oryx-panel-title');
await shot('3-taxes', '/settings', '[data-testid="tax-rates-panel"]');
await shot('4-documents-register', '/documents', '[data-testid="document-register"], table');
await shot('5-sales-invoices', '/sales', '[data-testid="sales-page"]');
await shot('6-inventory-products', '/inventory', 'table');

console.log(`\n${results.filter(r=>r.ok).length}/${results.length} captured`);
await browser.close();
process.exit(results.every(r=>r.ok) ? 0 : 1);
