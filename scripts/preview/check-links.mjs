import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:8099';
const START = ['/', '/evidence/', '/reports/', '/brand/', '/reports/04phaseelighttheme.html'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

const bad = [];
page.on('response', (r) => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
});

const seen = new Set();
const queue = [...START];
while (queue.length) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
  for (const href of hrefs) {
    if (!href || /^https?:|^mailto:|^#/.test(href)) continue;
    const resolved = new URL(href, BASE + url);
    const path = resolved.pathname + resolved.search;
    if (!seen.has(path)) queue.push(path);
  }
}

// Dark render of every page reached above.
//
// The site resolves its theme from `localStorage` (the header toggle), not from
// `prefers-color-scheme`, so `emulateMedia` alone leaves it on the default
// light theme and the "dark" pass would measure the light palette. The stored
// preference is set instead, which is what the toggle itself writes.
let darkIssues = 0;
await ctx.addInitScript(() => {
  window.localStorage.setItem('oryx.customer.theme', 'dark');
});
for (const url of seen) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const fg = await page.evaluate(() => getComputedStyle(document.body).color);
  const broken = await page.evaluate(
    () => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length,
  );
  if (overflow > 2 || broken > 0) {
    darkIssues += 1;
    console.log(`  dark issue ${url} overflow=${overflow} broken=${broken}`);
  }
  if (url === '/') console.log(`  dark theme body bg=${bg} color=${fg}`);
}

await browser.close();
console.log(`pages crawled: ${seen.size}`);
console.log(`bad responses: ${bad.length ? [...new Set(bad)] : 0}`);
console.log(`dark-mode issues: ${darkIssues}`);
