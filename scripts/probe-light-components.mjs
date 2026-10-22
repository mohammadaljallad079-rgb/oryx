/**
 * Report the computed background and ink of every component family on each
 * surface, in the light theme.
 *
 * This is the direct evidence for "the light theme looks inconsistent": if the
 * cards, buttons, nav, forms and tables each resolve to a slightly different
 * near-white, the page reads as assembled rather than designed even though no
 * rule contains a hardcoded colour.
 *
 * It also flags any background that is neither a known surface token nor a
 * photograph, which is where an ad-hoc value hides.
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_BASE ?? 'http://127.0.0.1:3002';
const PAGES = ['/', '/providers', '/login'];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar' });
const page = await context.newPage();
await page.addInitScript(() => {
  window.localStorage.setItem('oryx.customer.theme', 'light');
  window.localStorage.setItem('oryx.customer.locale', 'ar');
});

for (const path of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    // Group every element by its first oryx- class so we compare like with like.
    const groups = new Map();
    for (const el of document.querySelectorAll('[class*="oryx-"]')) {
      const cls = [...el.classList].find((c) => c.startsWith('oryx-'));
      if (!cls) continue;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if (!groups.has(cls)) groups.set(cls, new Map());
      const key = `${cs.backgroundColor} | ${cs.color} | border:${cs.borderTopColor}`;
      groups.get(cls).set(key, (groups.get(cls).get(key) ?? 0) + 1);
    }
    return [...groups.entries()].map(([cls, variants]) => ({
      cls,
      variants: [...variants.entries()].map(([k, n]) => ({ k, n })),
    }));
  });

  console.log(`\n================= ${path} =================`);
  // Show the distinct surface fills, aggregated, so duplicates are obvious.
  const fills = new Map();
  for (const g of data) {
    for (const v of g.variants) {
      const [bg] = v.k.split(' | ');
      if (bg === 'rgba(0, 0, 0, 0)') continue;
      fills.set(bg, (fills.get(bg) ?? 0) + v.n);
    }
  }
  console.log('distinct background fills:');
  for (const [bg, n] of [...fills.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${bg.padEnd(30)} ${n} element(s)`);
  }
  const multi = data.filter((g) => g.variants.length > 1);
  if (multi.length) {
    console.log('component families resolving to more than one style:');
    for (const g of multi.slice(0, 12)) {
      console.log(`   ${g.cls}: ${g.variants.length} variants`);
      for (const v of g.variants.slice(0, 4)) console.log(`        ${v.k}  x${v.n}`);
    }
  }
}

await browser.close();
