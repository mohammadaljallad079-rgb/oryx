/** Find elements wider than the viewport at 390px. */
import { chromium } from 'playwright';

const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const browser = await chromium.launch();
const width = Number(process.argv[2] ?? 390);
const locale = process.argv[3] ?? 'ar';
const theme = process.argv[4] ?? 'dark';
const ctx = await browser.newContext({ viewport: { width, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(
  ([l, t]) => {
    localStorage.setItem('oryx.customer.locale', l);
    localStorage.setItem('oryx.customer.theme', t);
  },
  [locale, theme],
);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(1500);

const offenders = await page.evaluate(() => {
  const vw = window.innerWidth;
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      const path = [];
      let n = el;
      while (n && n.tagName && path.length < 4) {
        path.unshift(
          n.tagName.toLowerCase() +
            (n.className && typeof n.className === 'string'
              ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.')
              : ''),
        );
        n = n.parentElement;
      }
      out.push({ path: path.join(' > '), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
    }
  }
  return { vw, offenders: out.slice(0, 20) };
});
console.log(`width=${width} locale=${locale} theme=${theme}`);
console.log(JSON.stringify(offenders, null, 2));
await browser.close();

