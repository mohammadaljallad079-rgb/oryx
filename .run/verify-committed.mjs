import { chromium } from 'playwright';

const URL = 'https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/evidence/exec07-phase-e/marketplace-committed/index.html';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await p.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 });
await p.waitForTimeout(4000);
const broken = await p.evaluate(() =>
  [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
);
console.log(
  'images:', await p.locator('img').count(),
  '| figures:', await p.locator('figure').count(),
  '| broken:', broken.length ? broken.join(', ') : 'none',
);
await b.close();
