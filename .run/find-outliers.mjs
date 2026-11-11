/**
 * Reports every element that renders a "muted" or "button" style with a value
 * that differs from the dominant value, so an outlier can be traced to a rule.
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light';
const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => window.localStorage.setItem('oryx.customer.theme', t), THEME);
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });

for (const path of ['/', '/services', '/providers', '/login']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);
  const rows = await page.evaluate(() => {
    const out = [];
    const push = (el, note) => {
      const cs = getComputedStyle(el);
      out.push({
        note,
        cls: el.className && typeof el.className === 'string' ? el.className : '',
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? '').trim().slice(0, 34),
        fontSize: cs.fontSize,
        color: cs.color,
        radius: cs.borderRadius,
        height: cs.height,
      });
    };
    for (const el of document.querySelectorAll('.oryx-muted')) push(el, 'muted');
    for (const el of document.querySelectorAll('.oryx-btn')) push(el, 'btn');
    return out;
  });
  console.log(`\n=== ${path} ===`);
  const byNote = {};
  for (const r of rows) {
    byNote[r.note] ??= [];
    byNote[r.note].push(r);
  }
  for (const [note, list] of Object.entries(byNote)) {
    const fontCount = {};
    for (const r of list) fontCount[r.fontSize] = (fontCount[r.fontSize] ?? 0) + 1;
    const dominant = Object.entries(fontCount).sort((a, b) => b[1] - a[1])[0][0];
    console.log(`  ${note}: ${list.length} elements; dominant font-size ${dominant}`);
    for (const r of list) {
      if (r.fontSize !== dominant) {
        console.log(`    OUTLIER ${r.fontSize}  <${r.tag} class="${r.cls}">  "${r.text}"`);
      }
    }
  }
}
await browser.close();
