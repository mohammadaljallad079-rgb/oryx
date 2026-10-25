/**
 * Captures every screen of the ORYX Marketplace mobile app.
 *
 * The customer session is a small JSON blob in `localStorage`
 * (`oryx.marketplace.session`) on web — see `apps/mobile/src/lib/session-storage.ts`.
 * The app restores it once at start-up, so seeding it before the first
 * navigation puts the app inside the signed-in shell without driving the login
 * form. Navigation then happens *inside* the app: a full page reload drops the
 * in-memory access token (a documented artefact of running a native client in a
 * browser), so each route is reached by clicking, never by reloading a URL.
 *
 * Both locales are swept. The locale is a stored preference, so it is seeded the
 * same way and the app re-renders RTL/LTR on its own.
 *
 * Run with: node .run/capture-all-mobile-screens.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.MOBILE_WEB_URL ?? 'http://127.0.0.1:8081/mobile';
const OUT = 'docs/audit/exec07/marketplace-demo/screenshots';
const CUSTOMER = { email: 'customer@oryx.demo' };

mkdirSync(`${OUT}/en`, { recursive: true });
mkdirSync(`${OUT}/ar`, { recursive: true });

/** The routes to visit, in the order a reviewer would walk them. */
const ROUTES = [
  ['onboarding', '/onboarding', 'Onboarding'],
  ['login', '/login', 'Sign in'],
  ['home', '/home', 'Home'],
  ['parts', '/parts', 'Parts shop'],
  ['part-detail', '/parts/prod-001', 'Part detail'],
  ['store', '/parts/store/store-01', 'Store'],
  ['services', '/services', 'Service directory'],
  ['service-detail', '/services/inspection-01', 'Service detail'],
  ['sensage', '/sensage', 'SENSAGE'],
  ['sensage-new', '/sensage/new', 'SENSAGE booking'],
  ['recovery', '/recovery', 'Recovery'],
  ['bookings', '/bookings', 'Bookings'],
  ['bookings-new', '/bookings/new', 'New booking'],
  ['cart', '/cart', 'Cart'],
  ['checkout', '/checkout', 'Checkout'],
  ['orders', '/orders', 'Orders'],
  ['order-detail', '/orders/order-001', 'Order detail'],
  ['wallet', '/wallet', 'Wallet'],
  ['favourites', '/favourites', 'Favourites'],
  ['vehicles', '/vehicles/veh-01', 'Vehicle'],
  ['vehicles-new', '/vehicles/new', 'Add vehicle'],
  ['addresses', '/addresses', 'Addresses'],
  ['notifications', '/notifications', 'Notifications'],
  ['support', '/support', 'Support'],
  ['account', '/account', 'Account'],
  ['recovery-detail', '/recovery/recovery-001', 'Recovery detail'],
  ['sensage-detail', '/sensage/sensage-001', 'SENSAGE report'],
];

/** The merchant shell is a separate role; it gets its own sweep. */
const MERCHANT_ROUTES = [
  ['merchant-dashboard', '/merchant/dashboard', 'Merchant dashboard'],
  ['merchant-orders', '/merchant/orders', 'Merchant orders'],
  ['merchant-products', '/merchant/products', 'Merchant products'],
  ['merchant-services', '/merchant/services', 'Merchant services'],
  ['merchant-promotions', '/merchant/promotions', 'Merchant promotions'],
  ['merchant-profile', '/merchant/profile', 'Merchant profile'],
  ['merchant-plan', '/merchant/plan', 'Merchant plan'],
];

const browser = await chromium.launch();
const results = [];

async function sweep(locale, theme, routes, account, prefix) {
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
  });
  // Seed the stored preferences and session before the bundle runs. The app
  // reads them once, on mount.
  await ctx.addInitScript(
    ([loc, th, email]) => {
      try {
        localStorage.setItem('oryx.marketplace.session', JSON.stringify({ email }));
        localStorage.setItem('oryx.marketplace.locale', JSON.stringify(loc));
        localStorage.setItem('oryx.marketplace.theme', JSON.stringify(th));
      } catch {
        /* storage unavailable; the app falls back to defaults */
      }
    },
    [locale, theme, account.email],
  );

  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160));
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(3500);

  for (const [name, route, label] of routes) {
    // Navigate inside the app with the history API, which expo-router observes;
    // a reload would drop the in-memory token.
    await page.evaluate((r) => {
      window.history.pushState({}, '', `/mobile${r}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, route);
    await page.waitForTimeout(2200);

    const text = (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
    const file = `${OUT}/${prefix}/${name}.png`;
    await page.screenshot({ path: file });
    results.push({ locale, theme, name, route, label, url: page.url(), text: text.slice(0, 200) });
    console.log(`${prefix.padEnd(3)} ${name.padEnd(20)} ${page.url().replace(BASE, '')} :: ${text.slice(0, 70)}`);
  }

  if (errors.length) console.log(`  console errors (${prefix}):`, errors.slice(0, 3).join(' ;; '));
  await ctx.close();
}

await sweep('en', 'light', ROUTES, CUSTOMER, 'en');
await sweep('ar', 'light', ROUTES, CUSTOMER, 'ar');

// The merchant shell, one locale, to prove the role split renders.
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('oryx.marketplace.session', JSON.stringify({ email: 'merchant@oryx.demo' }));
      localStorage.setItem('oryx.marketplace.locale', JSON.stringify('en'));
      localStorage.setItem('oryx.marketplace.theme', JSON.stringify('light'));
    } catch {
      /* ignore */
    }
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(3500);
  mkdirSync(`${OUT}/merchant`, { recursive: true });
  for (const [name, route, label] of MERCHANT_ROUTES) {
    await page.evaluate((r) => {
      window.history.pushState({}, '', `/mobile${r}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, route);
    await page.waitForTimeout(2200);
    const text = (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
    await page.screenshot({ path: `${OUT}/merchant/${name}.png` });
    results.push({ locale: 'en', theme: 'light', name, route, label, url: page.url(), text: text.slice(0, 200) });
    console.log(`mch ${name.padEnd(20)} ${page.url().replace(BASE, '')} :: ${text.slice(0, 70)}`);
  }
  await ctx.close();
}

await browser.close();

const { writeFileSync } = await import('node:fs');
writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify(results, null, 2)}\n`);
console.log(`\n${results.length} screens captured to ${OUT}`);
