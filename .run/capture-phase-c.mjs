/**
 * Execution 07 Phase C — captures every customer web route, authenticated and
 * public, at desktop / tablet / mobile widths.
 *
 * Writes docs/audit/exec07/phase-c/<phase>/<route>-<width>.png and a JSON
 * manifest recording the URL, status, viewport and any horizontal overflow.
 *
 * Run with: node .run/capture-phase-c.mjs before|after
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const PHASE = process.argv[2] === 'before' ? 'before' : 'after';
const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const OUT = `docs/audit/exec07/phase-c/${PHASE}`;

const CUSTOMER_USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const WIDTHS = [
  ['desktop', { width: 1440, height: 1024 }],
  ['tablet', { width: 834, height: 1112 }],
  ['mobile', { width: 390, height: 844 }],
];

// Payments have no standalone page: the customer payment history and refunds
// render inside /invoices, so that route is the payments surface.
const AUTH_ROUTES = [
  'dashboard',
  'garage',
  'bookings',
  'invoices',
  'support',
  'notifications',
  'profile',
];

// Public surfaces, reachable without a session.
const PUBLIC_ROUTES = ['', 'services', 'providers', 'providers/apply', 'login', 'register'];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const manifest = [];

async function customerSignIn(page) {
  await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(CUSTOMER_USER.email);
  await page.locator('input[type="password"]').first().fill(CUSTOMER_USER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/dashboard', { timeout: 45_000 });
  await page.waitForTimeout(2500);
}

async function shoot(page, name, path, width, locale, theme) {
  // localStorage is unavailable on about:blank, so the first navigation must
  // happen before the preference write. Every later route reuses the origin.
  if (new URL(page.url()).origin === 'null') {
    await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
  }
  await page.evaluate(
    ([l, t]) => {
      window.localStorage.setItem('oryx.customer.locale', l);
      window.localStorage.setItem('oryx.customer.theme', t);
    },
    [locale, theme],
  );
  const res = await page.goto(`${CUSTOMER}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/${name}-${width}.png` });
  // Horizontal overflow at this width is the defect the responsive matrix looks
  // for, so record it alongside the image rather than only in a separate run.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const status = res ? res.status() : 0;
  manifest.push({ route: path || '/', width, locale, theme, status, overflow });
  console.log(`  ${name}-${width}  status=${status} overflow=${overflow}`);
}

for (const [width, viewport] of WIDTHS) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
  await customerSignIn(page);
  for (const route of AUTH_ROUTES) {
    for (const [locale, theme] of [['en', 'dark'], ['ar', 'dark']]) {
      await shoot(page, route.replace(/\//g, '-'), `/${route}`, width, locale, theme);
    }
  }
  await ctx.close();

  const pubCtx = await browser.newContext({ viewport });
  const pubPage = await pubCtx.newPage();
  for (const route of PUBLIC_ROUTES) {
    for (const [locale, theme] of [['en', 'dark'], ['ar', 'light']]) {
      await shoot(pubPage, route ? route.replace(/\//g, '-') : 'home', `/${route}`, width, locale, theme);
    }
  }
  await pubCtx.close();
}

await browser.close();
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
const bad = manifest.filter((m) => m.status >= 400 || m.overflow > 1);
console.log(`\n${manifest.length} captures; ${bad.length} with a status>=400 or overflow`);
if (bad.length) console.log(bad.map((b) => `  ${b.route} @${b.width} status=${b.status} overflow=${b.overflow}`).join('\n'));
console.log('->', OUT);
