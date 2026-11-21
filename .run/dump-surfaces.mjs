/**
 * Dumps the exact painted colour of the structural surfaces in both themes,
 * sampling the real pixel behind each element rather than compositing layers by
 * hand. Reports the theme's own value, so a light/dark difference is a number.
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:12001';
const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const TARGETS = [
  ['page field', 'body'],
  ['header band', '.oryx-header'],
  ['card', '.oryx-card'],
  ['service card', '.oryx-service-card'],
  ['kpi icon chip', '.oryx-kpi__icon'],
  ['feature icon chip', '.oryx-feature__icon'],
  ['state icon chip', '.oryx-state__icon'],
  ['address icon chip', '.oryx-address__icon'],
  ['auth mark chip', '.oryx-auth__mark'],
  ['input', '.oryx-input'],
  ['footer', '.oryx-footer'],
  ['hero band', '.oryx-hero--home'],
  ['page head band', '.oryx-page-head'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });

for (const theme of ['light', 'dark']) {
  await page.evaluate((t) => window.localStorage.setItem('oryx.customer.theme', t), theme);
  console.log(`\n=== ${theme} ===`);
  for (const path of ['/', '/dashboard', '/login', '/profile']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(600);
    console.log(`  -- ${path}`);
    for (const [label, sel] of TARGETS) {
      const info = await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          bgImg: cs.backgroundImage === 'none' ? '' : cs.backgroundImage.slice(0, 70),
          color: cs.color,
          bc: cs.borderTopColor,
          radius: cs.borderRadius,
        };
      }, sel);
      if (!info) continue;
      console.log(
        `     ${label.padEnd(18)} bg=${info.bg.padEnd(26)} ink=${info.color.padEnd(20)} bc=${info.bc.padEnd(26)} r=${info.radius}${info.bgImg ? ' IMG' : ''}`,
      );
    }
  }
}
await browser.close();
