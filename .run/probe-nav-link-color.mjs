/**
 * Does the same nav-link primitive render the same colour on every surface?
 *
 * `.run/consistency-audit.mjs` groups `.oryx-nav a` by font size, weight, radius
 * and padding — but not by `color`. The per-primitive light audit
 * (`.run/audit-light-theme.mjs`) reads `color` and shows the homepage's nav link
 * as deep charcoal (#22201d) while every other surface shows muted grey
 * (#5a544b). Same primitive, two inks, which is exactly the "inconsistent"
 * report. This probe isolates the cause: it prints each matching element's text,
 * colour and the class list of its ancestors, so a different *element* matching
 * the selector can be told apart from a genuine colour override.
 *
 * Usage: node .run/probe-nav-link-color.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const USER = {
  email: process.env.ORYX_CUSTOMER_EMAIL ?? 'rider@oryx.local',
  password: process.env.ORYX_CUSTOMER_PASSWORD ?? 'ChangeMe!Oryx2026',
};
const PATHS = ['/', '/services', '/providers', '/dashboard', '/profile'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', USER.email);
await page.fill('input[type="password"]', USER.password);
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard|\//, { timeout: 30000 }).catch(() => {});
await page.evaluate(() => localStorage.setItem('oryx.theme', 'light'));

for (const path of PATHS) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(300);
  const rows = await page.evaluate(() => {
    return [...document.querySelectorAll('.oryx-nav a')].map((el) => {
      const cs = getComputedStyle(el);
      const chain = [];
      for (let n = el.parentElement; n && chain.length < 4; n = n.parentElement) {
        chain.push(n.className || n.tagName.toLowerCase());
      }
      return {
        text: (el.textContent || '').trim().slice(0, 18),
        color: cs.color,
        weight: cs.fontWeight,
        classes: el.className,
        chain: chain.join(' < '),
      };
    });
  });
  console.log(`\n=== ${path} — ${rows.length} .oryx-nav a ===`);
  for (const r of rows) {
    console.log(`  "${r.text}"  color=${r.color}  weight=${r.weight}`);
    console.log(`      classes=${r.classes}`);
    console.log(`      ancestors=${r.chain}`);
  }
}

await browser.close();
