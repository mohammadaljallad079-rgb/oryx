import { chromium } from 'playwright';

const URL = 'https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/evidence/exec07-phase-e/marketplace/';
const OUT = '.run/evidence/exec07-phase-e/marketplace/gallery-preview.png';

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
await p.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 });
await p.waitForTimeout(3500);

const broken = await p.evaluate(() =>
  [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
);
console.log('images total :', await p.locator('img').count());
console.log('broken images:', broken.length ? broken.join(', ') : 'none');
console.log('figures      :', await p.locator('figure').count());
console.log('h1           :', (await p.locator('h1').innerText()).trim());

await p.screenshot({ path: OUT, fullPage: true });
console.log('wrote', OUT);
await b.close();
