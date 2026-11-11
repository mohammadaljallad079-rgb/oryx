/**
 * Verify theme switching through the real UI, not by writing localStorage.
 *
 * Clicks the app's own theme control, reloads, and records the theme at the
 * first paint and after hydration. The bootstrap script should make the first
 * paint match the stored preference, so a light-theme user never sees a dark
 * flash.
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_BASE ?? 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const EMAIL = process.env.ORYX_EMAIL ?? 'admin@oryx-auto.local';
const PASSWORD = process.env.ORYX_PASSWORD ?? 'ChangeMe!Oryx2026';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-SA' });
const page = await ctx.newPage();

const record = () => {
  window.__firstTheme = null;
  const rec = () => {
    const d = document.documentElement;
    if (window.__firstTheme === null && d?.getAttribute('data-theme')) {
      window.__firstTheme = d.getAttribute('data-theme');
    }
  };
  const start = () => {
    rec();
    new MutationObserver(rec).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'] });
  };
  if (document.documentElement) start();
  else document.addEventListener('readystatechange', start, { once: true });
};
await page.addInitScript(record);

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
await page.locator('[data-testid="login-email"]').fill(EMAIL);
await page.locator('[data-testid="login-password"]').fill(PASSWORD);
await page.locator('[data-testid="login-submit"]').click();
await page.waitForURL('**/dashboard', { timeout: 60000 });
await page.waitForTimeout(1500);

const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));

// Find the theme control in the header and click it.
const toggle = page.locator('[data-testid*="theme"], button:has-text("فاتح"), button:has-text("Light"), button:has-text("داكن"), button:has-text("Dark")').first();
let clicked = false;
try {
  await toggle.click({ timeout: 5000 });
  clicked = true;
} catch {
  /* fall through: report the selector miss rather than a false pass */
}
await page.waitForTimeout(1500);

const themeAfterClick = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const storedAfterClick = await page.evaluate(() => localStorage.getItem('oryx.theme'));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const afterReload = await page.evaluate(() => ({
  firstPaintTheme: window.__firstTheme,
  afterHydration: document.documentElement.getAttribute('data-theme'),
  stored: localStorage.getItem('oryx.theme'),
}));

console.log(
  JSON.stringify(
    { themeBefore, toggleFound: clicked, themeAfterClick, storedAfterClick, afterReload },
    null,
    2,
  ),
);
await browser.close();
