import { chromium } from 'playwright';
const b = await chromium.launch();
for (const vp of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]) {
  const p = await b.newPage({ viewport: { width: vp.width, height: vp.height } });
  await p.goto('http://localhost:3002/providers', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await p.waitForTimeout(900);
  const info = await p.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    dir: document.documentElement.getAttribute('data-dir'),
    lang: document.documentElement.lang,
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    scrollH: document.documentElement.scrollHeight,
    firstBand: (() => {
      const h = document.querySelector('[class*="band"], .oryx-hero, header');
      return h ? `${h.className} :: ${getComputedStyle(h).backgroundColor}` : 'none';
    })(),
  }));
  console.log(vp.name, JSON.stringify(info));
  await p.close();
}
await b.close();
