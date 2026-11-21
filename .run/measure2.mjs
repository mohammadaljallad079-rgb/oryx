import { chromium } from 'playwright';
const C = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const [width, locale, theme] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width, height: 900 } });
const p = await ctx.newPage();
await p.goto(`${C}/`, { waitUntil: 'domcontentloaded' });
await p.evaluate(
  ([l, t]) => {
    localStorage.setItem('oryx.customer.locale', l);
    localStorage.setItem('oryx.customer.theme', t);
  },
  [locale, theme],
);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const inner = document.querySelector('.oryx-header-inner');
  const cont = document.querySelector('.oryx-header .oryx-container');
  const g = (el) =>
    el ? { w: Math.round(el.getBoundingClientRect().width), cls: (el.className || '').toString().slice(0, 30) } : null;
  const nav = document.querySelector('.oryx-nav');
  return {
    vw: innerWidth,
    containerW: Math.round(cont.getBoundingClientRect().width),
    containerPad: getComputedStyle(cont).paddingLeft + '/' + getComputedStyle(cont).paddingRight,
    containerMaxW: getComputedStyle(cont).maxWidth,
    innerW: Math.round(inner.getBoundingClientRect().width),
    kids: [...inner.children].map(g),
    navDisplay: nav ? getComputedStyle(nav).display : null,
    navScroll: nav?.scrollWidth,
  };
});
console.log(JSON.stringify(r));
await b.close();
