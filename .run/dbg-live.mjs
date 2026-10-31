import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8081/mobile';
const API = 'http://127.0.0.1:3001/api/v1';
const email = `dbg-${Date.now()}@test.local`;
const reg = await fetch(`${API}/customer/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-oryx-client': 'mobile' },
  body: JSON.stringify({ email, password: 'dbg-password-1234567', fullName: 'Dbg', preferredLocale: 'en' }),
});
const s = await reg.json();
const hp = await (await fetch(`${API}/customer/homepage?locale=en`)).json();
const p0 = hp.products[0];
await fetch(`${API}/customer/cart/items`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.accessToken}`, 'x-oryx-client': 'mobile' },
  body: JSON.stringify({ productId: p0.id, quantity: 2 }),
});
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 915 } });
await ctx.addInitScript(([tok]) => {
  localStorage.setItem('oryx.marketplace.locale', '"en"');
  localStorage.setItem('oryx.marketplace.theme', '"dark"');
  localStorage.setItem('oryx.marketplace.session', JSON.stringify({ email: 'customer@oryx.demo' }));
  globalThis.__oryxAccessToken = tok;
}, [s.accessToken]);
const pg = await ctx.newPage();
const errs = [];
pg.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,180)); });
pg.on('pageerror', e => errs.push('PAGEERROR '+String(e).slice(0,180)));
await pg.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await pg.waitForTimeout(6000);
console.log('after load:', (await pg.locator('body').innerText()).replace(/\s+/g,' ').slice(0,120));
console.log('token seeded:', await pg.evaluate(() => typeof globalThis.__oryxAccessToken));
await pg.evaluate(() => { window.history.pushState({}, '', '/mobile/cart'); window.dispatchEvent(new PopStateEvent('popstate')); });
await pg.waitForTimeout(4000);
console.log('CART:', (await pg.locator('body').innerText()).replace(/\s+/g,' ').slice(0,220));
await pg.evaluate(() => { window.history.pushState({}, '', '/mobile/favourites'); window.dispatchEvent(new PopStateEvent('popstate')); });
await pg.waitForTimeout(4000);
console.log('FAVOURITES:', (await pg.locator('body').innerText()).replace(/\s+/g,' ').slice(0,220));
console.log('console errors:', errs.slice(0,5));
await b.close();
