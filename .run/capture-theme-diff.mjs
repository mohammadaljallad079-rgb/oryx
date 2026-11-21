/**
 * Captures the homepage in both themes at a fixed viewport from the local
 * static preview, so a CSS change can be diffed pixel-for-pixel against the
 * pre-change render. Writes to /tmp/theme-diff/<tag>-<theme>.png.
 *
 * Usage: node .run/capture-theme-diff.mjs <tag>
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TAG = process.argv[2] || 'current';
const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:8123';
const SITE = process.env.ORYX_BASE_PATH || '/oryx';
const OUT = '/tmp/theme-diff';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  await ctx.addInitScript((t) => {
    try {
      window.localStorage.setItem('oryx.customer.theme', t);
      window.localStorage.setItem('oryx.customer.locale', 'ar');
    } catch {
      /* no storage */
    }
  }, theme);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${SITE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${TAG}-${theme}.png` });
  console.log(`${OUT}/${TAG}-${theme}.png`);
  await ctx.close();
}
await browser.close();
