import { chromium } from 'playwright';

const BASE = process.env.ORYX_BASE ?? 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();

await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => localStorage.setItem('oryx.theme', 'light'));

// Record the attribute value at the very first opportunity on the next load,
// which is what a user actually sees as the first paint.
await p.addInitScript(() => {
  window.__firstTheme = null;
  const rec = () => {
    const d = document.documentElement;
    if (window.__firstTheme === null && d && d.getAttribute('data-theme')) {
      window.__firstTheme = d.getAttribute('data-theme');
    }
  };
  const start = () => {
    rec();
    new MutationObserver(rec).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  };
  if (document.documentElement) start();
  else document.addEventListener('readystatechange', start, { once: true });
});

await p.reload({ waitUntil: 'domcontentloaded' });
const light = {
  firstPaintTheme: await p.evaluate(() => window.__firstTheme),
  afterHydration: await p.evaluate(() => document.documentElement.getAttribute('data-theme')),
  stored: await p.evaluate(() => localStorage.getItem('oryx.theme')),
};

await p.evaluate(() => localStorage.setItem('oryx.theme', 'dark'));
await p.waitForTimeout(800);
const storedBeforeReload = await p.evaluate(() => localStorage.getItem('oryx.theme'));
await p.reload({ waitUntil: 'domcontentloaded' });
const dark = {
  storedBeforeReload,
  firstPaintTheme: await p.evaluate(() => window.__firstTheme),
  afterHydration: await p.evaluate(() => document.documentElement.getAttribute('data-theme')),
  stored: await p.evaluate(() => localStorage.getItem('oryx.theme')),
};

console.log(JSON.stringify({ light, dark }, null, 2));
await b.close();
