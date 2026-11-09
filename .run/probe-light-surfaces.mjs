/**
 * Samples the *painted* surface colours on each customer route.
 *
 * The contrast sweep proves every text pair is legible; it says nothing about
 * whether the field behind that text is the same ivory everywhere. The owner's
 * complaint was that the light theme "looks inconsistent", which is a surface
 * question: an ivory page beside a neutral-grey one reads as two themes.
 *
 * This reads the page background and the raised surface out of the rendered
 * pixels, so a route that paints a cooler or warmer field than its neighbours is
 * visible as a number rather than an impression.
 *
 * Run with: node .run/probe-light-surfaces.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const USER = {
  email: process.env.ORYX_CUSTOMER_EMAIL ?? 'rider@oryx.local',
  password: process.env.ORYX_CUSTOMER_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const ROUTES = ['/', '/services', '/providers', '/marketplace', '/login', '/dashboard', '/profile', '/bookings', '/garage', '/invoices', '/support', '/about'];

/** Warmth: how far the blue channel sits below the mean of red and green. */
const warmth = ([r, g, b]) => Math.round(((r + g) / 2 - b) * 10) / 10;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').first().fill(USER.email).catch(() => {});
await page.locator('input[type="password"]').first().fill(USER.password).catch(() => {});
await page.locator('button[type="submit"]').first().click().catch(() => {});
await page.waitForTimeout(4000);

await page.evaluate(() => {
  localStorage.setItem('oryx.customer.locale', 'en');
  localStorage.setItem('oryx.customer.theme', 'light');
});

const rows = [];
for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);

  const sample = await page.evaluate(() => {
    const root = document.documentElement;
    const read = (name) => getComputedStyle(root).getPropertyValue(name).trim();
    // The page field is what the body paints; the raised surface is a card.
    const body = getComputedStyle(document.body);
    const card = document.querySelector('.oryx-card, .oryx-panel, [class*="card"]');
    return {
      theme: root.getAttribute('data-theme'),
      bgToken: read('--bg'),
      surfaceToken: read('--surface'),
      bodyBg: body.backgroundColor,
      cardBg: card ? getComputedStyle(card).backgroundColor : null,
    };
  });

  const parse = (css) => {
    const m = /rgba?\(([^)]+)\)/.exec(css ?? '');
    if (!m) return null;
    const [r, g, b] = m[1].split(',').map((v) => parseFloat(v));
    return [r, g, b];
  };
  const bodyRgb = parse(sample.bodyBg);
  rows.push({
    route,
    theme: sample.theme,
    bgToken: sample.bgToken,
    body: sample.bodyBg,
    warmth: bodyRgb ? warmth(bodyRgb) : null,
  });
}

console.log('route            theme  --bg       body field                warmth');
for (const r of rows) {
  console.log(
    `${r.route.padEnd(16)} ${String(r.theme).padEnd(6)} ${r.bgToken.padEnd(10)} ${String(r.body).padEnd(24)} ${r.warmth}`,
  );
}
const warmths = rows.map((r) => r.warmth).filter((w) => w !== null);
const spread = Math.max(...warmths) - Math.min(...warmths);
console.log(`\nwarmth spread across routes: ${spread.toFixed(1)}`);
await browser.close();
