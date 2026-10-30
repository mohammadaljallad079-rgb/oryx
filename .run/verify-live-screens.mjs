/**
 * Verifies the live cart and favourites screens against the running API.
 *
 * A real customer is registered, the session is seeded into the app the way
 * `session-storage` would restore it, and the screens are driven inside the app.
 * Navigation is internal: a reload drops the in-memory access token, which is a
 * documented artefact of running a native client in a browser.
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8081/mobile';
const API = 'http://127.0.0.1:3001/api/v1';
const email = `live-${Date.now()}@test.local`;
const password = 'live-screen-password-12345';

// Register through the API, exactly as the app's client would.
const reg = await fetch(`${API}/customer/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-oryx-client': 'mobile' },
  body: JSON.stringify({ email, password, fullName: 'Live Screens', preferredLocale: 'en' }),
});
if (!reg.ok) throw new Error(`register failed ${reg.status} ${await reg.text()}`);
const session = await reg.json();
console.log(`registered ${email}, token ${session.accessToken ? 'issued' : 'MISSING'}`);

// Find a product to add, through the public homepage.
const hp = await (await fetch(`${API}/customer/homepage?locale=en`)).json();
const product = hp.products[0];
if (!product) throw new Error('no products in the catalogue to add');
console.log(`using product ${product.sku} (${product.name})`);

// Add one to the cart as the API would, so the screen has something to show.
const add = await fetch(`${API}/customer/cart/items`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.accessToken}`,
    'x-oryx-client': 'mobile',
  },
  body: JSON.stringify({ productId: product.id, quantity: 2 }),
});
console.log(`cart add: ${add.status}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await ctx.addInitScript(
  ([loc, th, token, refresh]) => {
    localStorage.setItem('oryx.marketplace.locale', JSON.stringify(loc));
    localStorage.setItem('oryx.marketplace.theme', JSON.stringify(th));
    // The refresh token is what the app restores; the access token is memory-only,
    // so it is injected for this check only.
    localStorage.setItem('oryx.marketplace.session', JSON.stringify({ email: 'live@test.local' }));
    // The access token is memory-only, so the check seeds it through the same
    // seam the app uses. This is a test affordance, not a product path.
    globalThis.__oryxAccessToken = token;
    globalThis.__oryxRefreshToken = refresh;
  },
  ['en', 'dark', session.accessToken, session.refreshToken ?? ''],
);

const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(3000);

// Drive to the cart and read what the screen actually rendered.
await page.evaluate(() => {
  window.history.pushState({}, '', '/mobile/cart');
  window.dispatchEvent(new PopStateEvent('popstate'));
});
await page.waitForTimeout(2500);
const cartText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
console.log(`\nCART screen: ${cartText.slice(0, 200)}`);
console.log(`  shows the live product: ${cartText.includes(product.name)}`);
console.log(`  shows a total: ${/\d+\.\d{3}/.test(cartText)}`);
await page.screenshot({ path: 'docs/audit/exec07/functional/live-cart.png' });

await page.evaluate(() => {
  window.history.pushState({}, '', '/mobile/favourites');
  window.dispatchEvent(new PopStateEvent('popstate'));
});
await page.waitForTimeout(2500);
const favText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
console.log(`\nFAVOURITES screen: ${favText.slice(0, 200)}`);
await page.screenshot({ path: 'docs/audit/exec07/functional/live-favourites.png' });

await browser.close();
