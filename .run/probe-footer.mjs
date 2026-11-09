import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en' });
await p.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
await p.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'light');
  document.documentElement.setAttribute('data-dir', 'ltr');
});
await p.waitForTimeout(1500);
const info = await p.evaluate(() => {
  const y = 3430;
  window.scrollTo(0, y - 430);
  const nodes = document.elementsFromPoint(200, 430).map((n) => ({
    tag: n.tagName.toLowerCase(),
    cls: String(n.className).slice(0, 60),
    text: (n.textContent || '').trim().slice(0, 80),
    font: getComputedStyle(n).fontFamily.slice(0, 60),
  }));
  const fonts = document.fonts ? [...document.fonts].map((f) => `${f.family}:${f.status}`) : [];
  return { nodes: nodes.slice(0, 4), fonts: [...new Set(fonts)] };
});
console.log(JSON.stringify(info, null, 2));
await b.close();
