/**
 * Full rendered colour inventory for the light theme.
 *
 * Lists every distinct text colour and every distinct surface colour the theme
 * actually paints, with how often each appears and on which surfaces. A
 * professional theme has a small, intentional set; a long tail of one-off greys
 * is exactly the "inconsistent" the owner is describing.
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:12001';
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light';
const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const PATHS = ['/', '/services', '/providers', '/login', '/dashboard', '/bookings', '/invoices', '/support', '/profile', '/notifications', '/garage'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => window.localStorage.setItem('oryx.customer.theme', t), THEME);
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });

const ink = new Map();
const surface = new Map();

for (const path of PATHS) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);
  const data = await page.evaluate(() => {
    const inks = [];
    const surfaces = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own) inks.push(cs.color);
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') {
        surfaces.push(`${cs.backgroundColor}`);
      }
    }
    return { inks, surfaces };
  });
  for (const c of data.inks) {
    ink.set(c, (ink.get(c) ?? new Set()).add(path));
  }
  for (const c of data.surfaces) {
    surface.set(c, (surface.get(c) ?? new Set()).add(path));
  }
}

const show = (label, map) => {
  console.log(`\n=== ${label} (${map.size} distinct) ===`);
  const rows = [...map.entries()].sort((a, b) => b[1].size - a[1].size);
  for (const [c, paths] of rows) {
    console.log(`  ${c.padEnd(34)} ${paths.size} surface(s)  ${[...paths].join(' ')}`);
  }
};
show(`ink colours [${THEME}]`, ink);
show(`surface colours [${THEME}]`, surface);

await browser.close();
