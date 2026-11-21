/**
 * Probe the light-theme hero/page-header band: what background is actually
 * painted behind the band ink, and is the ink contrast real?
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const path = process.argv[2] ?? '/';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(`(() => {
  localStorage.setItem('oryx.customer.theme', 'light');
  localStorage.setItem('oryx.customer.locale', 'en');
  document.documentElement.setAttribute('data-theme', 'light');
})()`);
const page = await ctx.newPage();
await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1000);

const info = await page.evaluate(() => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const t = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!t) continue;
    const st = getComputedStyle(el);
    if (st.color === 'rgb(255, 255, 255)' || st.color === 'rgb(232, 199, 102)' || st.color === 'rgb(205, 216, 230)') {
      let node = el, chain = [];
      while (node && node.nodeType === 1 && chain.length < 6) {
        const s = getComputedStyle(node);
        chain.push({
          tag: node.tagName.toLowerCase(),
          cls: (typeof node.className === 'string' ? node.className : '').slice(0, 70),
          bgColor: s.backgroundColor,
          bgImage: s.backgroundImage === 'none' ? 'none' : s.backgroundImage.slice(0, 120),
        });
        node = node.parentElement;
      }
      const key = chain.map((c) => c.cls).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: t.slice(0, 50), color: st.color, chain });
    }
    if (out.length > 3) break;
  }
  return out;
});

console.log(JSON.stringify(info, null, 2));
await browser.close();
