/**
 * Captures the light theme at a viewport small enough to read in one image, so
 * the design can be judged visually rather than only by numbers.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const OUT = '.run/visual';
mkdirSync(OUT, { recursive: true });

const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };
const locale = process.argv[2] ?? 'en';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate((l) => window.localStorage.setItem('oryx.customer.locale', l), locale);
await page.evaluate(() => window.localStorage.setItem('oryx.customer.theme', 'light'));
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });
await page.waitForTimeout(1500);

const shots = [
  ['/', 'home'],
  ['/providers', 'providers'],
  ['/dashboard', 'dashboard'],
  ['/login', 'login'],
  ['/profile', 'profile'],
  ['/services', 'services'],
  ['/support', 'support'],
];

for (const [path, name] of shots) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  // Viewport-only, so the image is legible rather than a 4000px strip.
  await page.screenshot({ path: `${OUT}/${locale}-${name}-light.png` });
  console.log(`captured ${name} (${page.url()})`);
}

await browser.close();
