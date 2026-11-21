/**
 * Dumps the resolved background/ink/border of every distinct primitive on each
 * customer surface so a cross-surface inconsistency is visible as a number.
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light';
const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const SELECTORS = [
  'body',
  '.oryx-card',
  '.oryx-surface',
  '.oryx-input',
  '.oryx-select',
  '.oryx-btn',
  '.oryx-btn-primary',
  '.oryx-table th',
  '.oryx-table td',
  '.oryx-badge',
  '.oryx-section',
  '.oryx-container',
  '.oryx-auth__card',
  '.oryx-page-head',
  '.oryx-kpi',
  '.oryx-feature',
  '.oryx-stat',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => window.localStorage.setItem('oryx.customer.theme', t), THEME);
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });
await page.waitForTimeout(1200);

for (const path of ['/', '/dashboard', '/providers', '/login', '/profile', '/bookings', '/invoices', '/support']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
  console.log(`\n=== ${path} [${THEME}] ===`);
  for (const sel of SELECTORS) {
    const info = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        n: document.querySelectorAll(s).length,
        bg: cs.backgroundColor,
        img: cs.backgroundImage === 'none' ? '' : cs.backgroundImage.slice(0, 60),
        color: cs.color,
        border: cs.borderTopColor,
      };
    }, sel);
    if (!info) continue;
    console.log(
      `  ${sel.padEnd(20)} n=${String(info.n).padEnd(3)} bg=${info.bg.padEnd(24)} ink=${info.color.padEnd(20)} border=${info.border}${info.img ? ' IMG' : ''}`,
    );
  }
}

await browser.close();
