/**
 * Measure the rendered structural regions of the admin light theme.
 *
 * The claim "the light theme looks inconsistent" is about how the surfaces sit
 * against each other, so this samples the average painted colour of the chrome
 * (page, sidebar, header, card, table head, button) in both themes and reports
 * how far apart the light surfaces are. Surfaces that are almost the same value
 * read as flat; a cold surface among warm ones reads as off-identity.
 *
 * Usage: node scripts/sample-admin-regions.mjs
 */

import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ADMIN = process.env.ORYX_ADMIN_BASE ?? 'http://127.0.0.1:12000';
const USER = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const REGIONS = [
  { name: 'page', sel: 'body' },
  { name: 'sidebar', sel: '.oryx-sidebar' },
  { name: 'header', sel: '.oryx-header' },
  { name: 'main', sel: 'main' },
  { name: 'card', sel: 'section, .oryx-section' },
  { name: 'table-head', sel: 'thead th' },
  { name: 'button', sel: 'button' },
];

function bootstrap(theme) {
  return `(() => {
    try { localStorage.setItem('oryx.theme', ${JSON.stringify(theme)}); localStorage.setItem('oryx.locale','en'); } catch {}
    const d = document.documentElement;
    d.setAttribute('data-theme', ${JSON.stringify(theme)});
    d.style.colorScheme = ${JSON.stringify(theme)};
    d.setAttribute('lang','en'); d.setAttribute('data-dir','ltr'); d.dir='ltr';
  })();`;
}

function average(buffer) {
  const png = PNG.sync.read(buffer);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 128) continue;
    r += png.data[i];
    g += png.data[i + 1];
    b += png.data[i + 2];
    n += 1;
  }
  return n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : null;
}

const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
const relLum = (c) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/usr/bin/chromium' });
  }
}

const browser = await launch();

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(bootstrap(theme));
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.locator('input[name="email"]').first().fill(USER.email);
  await page.locator('input[type="password"]').first().fill(USER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);

  console.log(`\n=== ${theme.toUpperCase()} — sampled regions ===`);
  const samples = [];
  for (const region of REGIONS) {
    const box = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return null;
      // Sample an interior strip, away from the rounded edge and its border.
      return {
        x: Math.max(0, r.x + 6),
        y: Math.max(0, r.y + 6),
        width: Math.max(4, Math.min(r.width - 12, 120)),
        height: Math.max(4, Math.min(r.height - 12, 40)),
      };
    }, region.sel);
    if (!box) {
      console.log(`  ${region.name.padEnd(12)} (absent)`);
      continue;
    }
    const shot = await page.screenshot({ clip: box });
    const avg = average(shot);
    samples.push({ name: region.name, avg });
    console.log(
      `  ${region.name.padEnd(12)} ${hex(avg).padEnd(9)} ` +
        `lum ${relLum(avg).toFixed(3)}  warmth ${String(avg.r - avg.b).padStart(4)}`,
    );
  }

  if (theme === 'light') {
    const lums = samples.map((s) => relLum(s.avg)).sort((a, b) => a - b);
    console.log(`  surface luminance spread: ${(lums[lums.length - 1] - lums[0]).toFixed(3)}`);
  }
  await ctx.close();
}

await browser.close();
