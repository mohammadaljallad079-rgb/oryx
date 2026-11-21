/**
 * Builds the reference-vs-implemented comparison sheets for the rebuilt Splash
 * and Homepage.
 *
 * Each sheet puts the approved mockup beside the capture of the running app, at
 * a matched height, so a reviewer can see the composition, the type scale and the
 * palette side by side rather than taking a claim on trust.
 *
 * Run: node .run/build-splash-home-comparison.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = 'docs/audit/exec07/splash-home';
const REF = 'apps/mobile/design-reference';
mkdirSync(OUT, { recursive: true });

const b64 = (p) => readFileSync(resolve(p)).toString('base64');

/** Pairs: [title, reference file + crop box, implemented capture]. */
const SHEETS = [
  {
    name: 'compare-splash-en',
    title: 'Splash — approved reference vs implemented (English)',
    ref: { file: `${REF}/ORYX_Homepage_Reference.jpg`, box: [171, 7, 687, 1024] },
    shot: `${OUT}/splash-en-phone.png`,
  },
  {
    name: 'compare-splash-ar',
    title: 'Splash — approved reference vs implemented (Arabic)',
    ref: { file: `${REF}/ORYX_Homepage_Reference.jpg`, box: [852, 7, 1369, 1024] },
    shot: `${OUT}/splash-ar-phone.png`,
  },
  {
    name: 'compare-home-en',
    title: 'Homepage — approved reference vs implemented (English)',
    ref: { file: `${REF}/ORYX_Splash_Reference.jpg`, box: [195, 10, 720, 1010] },
    shot: `${OUT}/home-light-en-phone.png`,
  },
  {
    name: 'compare-home-ar',
    title: 'Homepage — approved reference vs implemented (Arabic)',
    ref: { file: `${REF}/ORYX_Splash_Reference.jpg`, box: [845, 10, 1370, 1010] },
    shot: `${OUT}/home-light-ar-phone.png`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });

for (const sheet of SHEETS) {
  const [x0, y0, x1, y1] = sheet.ref.box;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; background:#0b0f14; color:#e8eef5; font:600 22px/1.3 system-ui,sans-serif; }
    h1 { font-size:26px; margin:22px 26px 14px; letter-spacing:.2px; }
    .row { display:flex; gap:26px; padding:0 26px 26px; align-items:flex-start; }
    .col { flex:1; }
    .cap { font-size:15px; color:#9fb3c8; margin:0 0 10px; text-transform:uppercase; letter-spacing:1.4px; }
    .frame { border:1px solid #26313d; border-radius:14px; overflow:hidden; background:#000; }
    img { display:block; width:100%; height:auto; }
    .refwrap { position:relative; width:100%; aspect-ratio:${x1 - x0}/${y1 - y0}; overflow:hidden; }
    .refwrap img { position:absolute; width:${(1536 / (x1 - x0)) * 100}%;
      left:${(-x0 / (x1 - x0)) * 100}%; top:${(-y0 / (y1 - y0)) * 100}%; }
  </style></head><body>
    <h1>${sheet.title}</h1>
    <div class="row">
      <div class="col"><p class="cap">Approved reference</p>
        <div class="frame"><div class="refwrap"><img src="data:image/jpeg;base64,${b64(sheet.ref.file)}"></div></div></div>
      <div class="col"><p class="cap">Implemented — running app</p>
        <div class="frame"><img src="data:image/png;base64,${b64(sheet.shot)}"></div></div>
    </div>
  </body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const el = await page.$('body');
  await el.screenshot({ path: `${OUT}/${sheet.name}.png` });
  console.log(`  ${sheet.name}  written`);
}

await browser.close();
