import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en' });
await p.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
await p.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'light');
  document.documentElement.setAttribute('data-dir', 'ltr');
});
await p.waitForTimeout(1500);
const el = await p.evaluate(() => {
  const e = document.elementFromPoint(200, 3418 - window.scrollY) || document.elementFromPoint(200, 400);
  const nodes = document.elementsFromPoint(200, 400);
  const target = document.querySelectorAll('*');
  const hits = [];
  for (const n of target) {
    const r = n.getBoundingClientRect();
    const top = r.top + window.scrollY;
    if (top < 3430 && top + r.height > 3430 && r.left < 271 && r.left + r.width > 140) {
      hits.push({ tag: n.tagName.toLowerCase(), cls: String(n.className).slice(0, 60), text: (n.textContent || '').trim().slice(0, 60) });
    }
  }
  return hits.slice(-6);
});
console.log(JSON.stringify(el, null, 2));
await b.close();
