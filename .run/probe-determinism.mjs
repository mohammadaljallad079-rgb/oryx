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
  // Mirror the capture script's settle loop so this is an apples-to-apples run.
  let last = -1;
  let stable = 0;
  for (let k = 0; k < 40 && stable < 5; k++) {
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    stable = h === last ? stable + 1 : 0;
    last = h;
    await p.waitForTimeout(200);
  }
  await p.screenshot({ path: `/tmp/det-${i}.png`, fullPage: true });
  console.log(`run ${i} height=${last}`);
}
await b.close();
