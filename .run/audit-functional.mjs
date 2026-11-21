/**
 * Functional audit of every customer and merchant route.
 *
 * For each route it records: the console errors, the page text length, whether
 * a known error state is shown, and the screenshot. This is the check that the
 * design work did not break a screen — not a test of the design itself.
 *
 * Navigation is internal (history.pushState), because a reload drops the
 * in-memory session token.
 *
 * Run: node .run/audit-functional.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.MOBILE_WEB_URL ?? 'http://127.0.0.1:8081/mobile';
const OUT = 'docs/audit/exec07/functional';
mkdirSync(OUT, { recursive: true });

const CUSTOMER = [
  ['onboarding', '/onboarding'], ['login', '/login'], ['register', '/register'],
  ['home', '/home'], ['categories', '/categories'], ['search', '/search'],
  ['parts', '/parts'], ['part-detail', '/parts/prod-001'], ['store', '/parts/store/store-01'],
  ['services', '/services'], ['service-detail', '/services/inspection-01'],
  ['sensage', '/sensage'], ['sensage-new', '/sensage/new'], ['sensage-detail', '/sensage/sensage-001'],
  ['recovery', '/recovery'], ['recovery-detail', '/recovery/recovery-001'],
  ['bookings', '/bookings'], ['bookings-new', '/bookings/new'],
  ['cart', '/cart'], ['checkout', '/checkout'],
  ['orders', '/orders'], ['order-detail', '/orders/order-001'],
  ['wallet', '/wallet'], ['favourites', '/favourites'],
  ['vehicles', '/vehicles/veh-01'], ['vehicles-new', '/vehicles/new'],
  ['addresses', '/addresses'], ['notifications', '/notifications'],
  ['support', '/support'], ['account', '/account'],
];
const MERCHANT = [
  ['merchant-dashboard', '/merchant/dashboard'], ['merchant-orders', '/merchant/orders'],
  ['merchant-products', '/merchant/products'], ['merchant-services', '/merchant/services'],
  ['merchant-promotions', '/merchant/promotions'], ['merchant-profile', '/merchant/profile'],
  ['merchant-plan', '/merchant/plan'],
];

const browser = await chromium.launch();
const rows = [];

async function sweep(routes, email, tag) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([e]) => {
    localStorage.setItem('oryx.marketplace.session', JSON.stringify({ email: e }));
    localStorage.setItem('oryx.marketplace.locale', JSON.stringify('en'));
    localStorage.setItem('oryx.marketplace.theme', JSON.stringify('dark'));
  }, [email]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 200)));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  for (const [name, route] of routes) {
    const before = errors.length;
    await page.evaluate((r) => {
      window.history.pushState({}, '', `/mobile${r}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, route);
    await page.waitForTimeout(1800);
    const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const newErrs = errors.slice(before);
    const white = text.length < 12;
    const errState = /something went wrong|unexpected error|TypeError|undefined is not/i.test(text);
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
    rows.push({ tag, name, route, chars: text.length, consoleErrors: newErrs.length, white, errState, first: text.slice(0, 90) });
    const flag = white ? 'WHITE' : errState ? 'ERROR-STATE' : newErrs.length ? `ERR(${newErrs.length})` : 'ok';
    console.log(`  ${flag.padEnd(11)} ${tag}/${name.padEnd(18)} ${String(text.length).padStart(5)}ch  ${text.slice(0, 56)}`);
  }
  await ctx.close();
}

await sweep(CUSTOMER, 'customer@oryx.demo', 'cust');
await sweep(MERCHANT, 'merchant@oryx.demo', 'mch');
await browser.close();

const { writeFileSync } = await import('node:fs');
writeFileSync(`${OUT}/audit.json`, JSON.stringify(rows, null, 2) + '\n');
const white = rows.filter((r) => r.white).length;
const errs = rows.filter((r) => r.consoleErrors).length;
const states = rows.filter((r) => r.errState).length;
console.log(`\n${rows.length} routes · white screens ${white} · routes with console errors ${errs} · error states ${states}`);
