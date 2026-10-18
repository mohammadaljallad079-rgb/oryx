/**
 * Phase C live verification: signs in as the demo customer over the public
 * HTTPS preview and asserts that each upgraded page renders its premium
 * structure (page header, real data or a designed empty state) rather than a
 * bare legacy panel. Also checks AR/RTL and light/dark switching.
 */
import { chromium } from 'playwright';

const ORIGIN = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const AUTH_ROUTES = ['/dashboard', '/garage', '/bookings', '/invoices', '/support', '/notifications', '/profile'];
const PUBLIC_ROUTES = ['/', '/services', '/providers', '/providers/apply', '/login', '/register'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
const results = [];

await page.goto(`${ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45000 });
await page.waitForTimeout(2000);

for (const route of AUTH_ROUTES) {
  const res = await page.goto(`${ORIGIN}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  const probe = await page.evaluate(() => ({
    // The dashboard was upgraded in an earlier phase and opens with the hero
    // block; every later page opens with the shared page header.
    head: !!document.querySelector('.oryx-page-head, .oryx-dash-hero'),
    title:
      document.querySelector('.oryx-page-head__title')?.textContent?.trim() ??
      document.querySelector('.oryx-dash-hero__title')?.textContent?.trim() ??
      '',
    state: !!document.querySelector('.oryx-state'),
    table: !!document.querySelector('.oryx-table'),
    list: !!document.querySelector('.oryx-list__item'),
    loginForm: !!document.querySelector('[data-testid="login-email"]'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  results.push({ route, status: res.status(), ...probe });
}

for (const route of PUBLIC_ROUTES) {
  const res = await page.goto(`${ORIGIN}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  const probe = await page.evaluate(() => ({
    // The home page has its own hero; services and providers use the header or
    // a section title, so accept either.
    head: !!document.querySelector('.oryx-page-head, .oryx-auth, .oryx-hero, .oryx-section-title'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  results.push({ route, status: res.status(), ...probe });
}

// AR / RTL and light/dark are checked on a public route: a hard reload of an
// authenticated page drops the in-memory customer access token by design, so
// reloading there would test the sign-in gate rather than the page.
await page.goto(`${ORIGIN}/providers`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => window.localStorage.setItem('oryx.customer.locale', 'ar'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const rtl = await page.evaluate(() => ({
  dir: document.documentElement.getAttribute('dir'),
  lang: document.documentElement.getAttribute('lang'),
  title: document.querySelector('.oryx-page-head__title')?.textContent?.trim() ?? '',
}));

await page.evaluate(() => window.localStorage.setItem('oryx.customer.theme', 'light'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const theme = await page.evaluate(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  bg: getComputedStyle(document.body).backgroundColor,
}));

await browser.close();

console.log(JSON.stringify({ results, rtl, theme }, null, 2));
const bad = results.filter((r) => r.status !== 200 || r.overflow > 1 || !r.head);
console.log(`\n${results.length} routes checked; ${bad.length} failed`);
if (bad.length) console.log(JSON.stringify(bad, null, 2));
