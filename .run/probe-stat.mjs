import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await p.waitForTimeout(900);
const out = await p.evaluate(() => {
  const el = document.querySelector('.oryx-stat__label');
  if (!el) return 'no stat label';
  const chain = [];
  let n = el;
  while (n && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    chain.push({
      tag: n.tagName.toLowerCase(),
      cls: n.className?.toString().slice(0, 70),
      bg: cs.backgroundColor,
      bgImg: cs.backgroundImage.slice(0, 90),
      color: cs.color,
    });
    n = n.parentElement;
  }
  return { label: el.textContent, chain };
});
console.log(JSON.stringify(out, null, 2));
await b.close();
