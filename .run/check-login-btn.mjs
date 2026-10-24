/**
 * Confirms whether the login-page primary button gradient differs because of a
 * hover state or a real rule, by sampling the same button twice.
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:12001';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => window.localStorage.setItem('oryx.customer.theme', 'light'));
await page.waitForTimeout(600);

const read = () =>
  page.evaluate(() => {
    const el = document.querySelector('.oryx-btn-primary');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundImage, hover: el.matches(':hover'), cls: el.className, text: el.textContent.trim() };
  });

await page.mouse.move(10, 10);
await page.waitForTimeout(300);
console.log('no hover:', await read());
const box = await page.locator('.oryx-btn-primary').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(400);
console.log('hover:   ', await read());
await browser.close();
