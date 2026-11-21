/**
 * Verify the light theme reads as designed: ivory field, warm neutral surfaces,
 * charcoal ink, gold accent present — measured from the live render, and
 * confirm the dark theme still resolves its navy palette.
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const PATHS = ['/', '/dashboard', '/providers', '/login'];

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    window.localStorage.setItem('oryx.customer.locale', 'en');
    window.localStorage.setItem('oryx.customer.theme', t);
  }, theme);
  await page.locator('input[type="email"]').first().fill('customer@oryx-demo.local');
  await page.locator('input[type="password"]').first().fill('OryxDemo!2026');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/dashboard', { timeout: 45_000 });

  console.log(`\n=== ${theme} ===`);
  for (const path of PATHS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(600);
    const s = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const card = document.querySelector('.oryx-card');
      const btn = document.querySelector('.oryx-btn-primary');
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        bg: root.getPropertyValue('--bg').trim(),
        surface: root.getPropertyValue('--surface').trim(),
        surfaceRaised: root.getPropertyValue('--surface-raised').trim(),
        text: root.getPropertyValue('--text').trim(),
        textMuted: root.getPropertyValue('--text-muted').trim(),
        gold: root.getPropertyValue('--gold').trim(),
        goldOnTint: root.getPropertyValue('--gold-on-tint').trim(),
        tintLine: root.getPropertyValue('--tint-line').trim(),
        cardBg: card ? getComputedStyle(card).backgroundColor : null,
        cardRadius: card ? getComputedStyle(card).borderRadius : null,
        btnBg: btn ? getComputedStyle(btn).backgroundImage.slice(0, 60) : null,
      };
    });
    console.log(`  ${path}`);
    console.log(`     bg=${s.bg} surface=${s.surface} raised=${s.surfaceRaised}`);
    console.log(`     text=${s.text} muted=${s.textMuted} gold=${s.gold} goldOnTint=${s.goldOnTint}`);
    console.log(`     card bg=${s.cardBg} radius=${s.cardRadius}`);
  }
  await ctx.close();
}
await browser.close();
