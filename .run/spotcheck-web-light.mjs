import { chromium } from 'playwright';
import sharp from 'sharp';

const URL = 'https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 1024 } })).newPage();

// The customer site defaults to dark; the light theme is the stored preference.
await p.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 });
await p.waitForTimeout(2500);
await p.evaluate(() => localStorage.setItem('oryx.theme', 'light'));
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(3000);

const probe = await p.evaluate(() => {
  const cs = getComputedStyle(document.body);
  const root = getComputedStyle(document.documentElement);
  return {
    bodyBg: cs.backgroundColor,
    bodyColor: cs.color,
    themeAttr: document.documentElement.getAttribute('data-theme'),
    themeClass: document.documentElement.className,
    stored: localStorage.getItem('oryx.theme'),
    rootBg: root.getPropertyValue('--oryx-bg').trim(),
    rootSurface: root.getPropertyValue('--oryx-surface').trim(),
    rootText: root.getPropertyValue('--oryx-text').trim(),
    rootGold: root.getPropertyValue('--oryx-gold').trim(),
  };
});
console.log('live homepage light:', JSON.stringify(probe, null, 2));

const buf = await p.screenshot();
await sharp(buf).toFile('.run/evidence/exec07-phase-e/marketplace/live-homepage-light.png');
await b.close();
