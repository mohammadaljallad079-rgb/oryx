/**
 * Verifies the runtime behaviours the delivery requires: RTL and LTR, the
 * offers rail and the featured stores, and that nothing reaches a host.
 * Run: node .run/verify-runtime.mjs
 */
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8081/mobile';
const b = await chromium.launch();

for (const [locale, expectDir] of [['en','ltr'],['ar','rtl']]) {
  const ctx = await b.newContext({ viewport:{width:412,height:915}, deviceScaleFactor:2 });
  await ctx.addInitScript(([loc]) => {
    localStorage.setItem('oryx.marketplace.session', JSON.stringify({email:'customer@oryx.demo'}));
    localStorage.setItem('oryx.marketplace.locale', JSON.stringify(loc));
    localStorage.setItem('oryx.marketplace.theme', JSON.stringify('dark'));
  }, [locale]);
  const page = await ctx.newPage();
  const external = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  await page.goto(`${BASE}/`, { waitUntil:'networkidle', timeout:60000 });
  await page.waitForTimeout(3500);
  // scroll the app's own scroll container to reach the lower rails
  const text = [];
  for (const frac of [0, 0.5, 1]) {
    await page.evaluate((f) => {
      const all=[...document.querySelectorAll('div')];
      let best=null; for(const el of all){ if(el.scrollHeight>el.clientHeight+40){ if(!best||el.scrollHeight>best.scrollHeight) best=el; } }
      if(best) best.scrollTop=(best.scrollHeight-best.clientHeight)*f;
    }, frac);
    await page.waitForTimeout(900);
    text.push((await page.locator('body').innerText()).replace(/\s+/g,' '));
  }
  const all = text.join(' ');
  const rtl = await page.evaluate(() => {
    let n=0; document.querySelectorAll('*').forEach(e=>{ if(getComputedStyle(e).direction==='rtl') n++; }); return n;
  });
  const ltr = await page.evaluate(() => {
    let n=0; document.querySelectorAll('*').forEach(e=>{ if(getComputedStyle(e).direction==='ltr') n++; }); return n;
  });
  console.log(`\n[${locale}] expected dir=${expectDir}`);
  console.log(`  elements rtl=${rtl} ltr=${ltr}  -> ${rtl>ltr?'rtl':'ltr'} dominant`);
  console.log(`  offers section : ${/offers and discounts|العروض والخصومات/i.test(all)?'PRESENT':'MISSING'}`);
  console.log(`  stores section : ${/featured stores|متاجر مميزة/i.test(all)?'PRESENT':'MISSING'}`);
  console.log(`  products       : ${/popular products|الأكثر طلب/i.test(all)?'PRESENT':'MISSING'}`);
  console.log(`  sensage        : ${/sensage/i.test(all)?'PRESENT':'MISSING'}`);
  console.log(`  categories     : ${/spare parts|قطع الغيار/i.test(all)?'PRESENT':'MISSING'}`);
  console.log(`  external requests: ${external.length}${external.length?' -> '+external.slice(0,3).join(', '):''}`);
  await ctx.close();
}
await b.close();
