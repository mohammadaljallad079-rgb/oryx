/** Identify the element that renders `.oryx-muted` at 12.5px on the homepage. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:12001';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.localStorage.setItem('oryx.customer.locale', 'en');
  window.localStorage.setItem('oryx.customer.theme', 'light');
});
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});

const out = await page.evaluate(() => {
  const rows = [];
  for (const el of document.querySelectorAll('.oryx-muted')) {
    const cs = getComputedStyle(el);
    if (cs.fontSize === '12.5px') {
      rows.push({
        tag: el.tagName,
        cls: el.className,
        text: (el.textContent ?? '').trim().slice(0, 40),
      });
    }
  }
  return rows;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
