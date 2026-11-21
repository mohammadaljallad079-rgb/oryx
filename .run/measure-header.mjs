/** Measure header children widths at a given viewport. */
import { chromium } from 'playwright';
const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const width = Number(process.argv[2] ?? 1280);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const inner = document.querySelector('.oryx-header-inner');
  const kids = [...inner.children].map((el) => ({
    cls: (el.className || '').toString().slice(0, 40),
    w: Math.round(el.getBoundingClientRect().width),
    scroll: el.scrollWidth,
  }));
  const acts = document.querySelector('.oryx-header-actions');
  return {
    vw: window.innerWidth,
    innerW: Math.round(inner.getBoundingClientRect().width),
    innerScroll: inner.scrollWidth,
    kids,
    actionsKids: acts ? [...acts.children].map((el) => ({ cls: (el.className||'').toString().slice(0,30), w: Math.round(el.getBoundingClientRect().width) })) : [],
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
