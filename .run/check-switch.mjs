import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8081/mobile';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 430, height: 932 } });
await c.addInitScript(() => {
  localStorage.setItem('oryx.marketplace.session', JSON.stringify({ email: 'customer@oryx.demo' }));
  localStorage.setItem('oryx.marketplace.locale', JSON.stringify('en'));
  localStorage.setItem('oryx.marketplace.theme', JSON.stringify('light'));
});
const p = await c.newPage();
await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(3500);
await p.evaluate(() => {
  window.history.pushState({}, '', '/mobile/account');
  window.dispatchEvent(new PopStateEvent('popstate'));
});
await p.waitForTimeout(2500);
const el = p.locator('[data-testid="switch-to-merchant"]');
const n = await el.count();
console.log('switch-to-merchant count:', n, 'visible:', n ? await el.first().isVisible() : 'n/a');
console.log('text tail:', (await p.locator('body').innerText()).replace(/\n+/g, ' | ').slice(-300));
await b.close();
