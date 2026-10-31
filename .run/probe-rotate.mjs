import { chromium } from 'playwright';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en' });
const p = await c.newPage();
for (let i = 0; i < 3; i++) {
  await p.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
  await p.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-dir', 'ltr');
  });
  await p.waitForTimeout(1500);
  const media = await p.evaluate(() => {
    const m = document.querySelector('.oryx-hero__media');
    return m ? getComputedStyle(m).backgroundImage.slice(0, 170) : 'none';
  });
  await p.screenshot({ path: `/tmp/rot-${i}.png`, fullPage: true });
  console.log(i, media);
}
await b.close();
