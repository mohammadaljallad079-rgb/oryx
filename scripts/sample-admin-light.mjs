/**
 * Sample the painted colour of the admin light theme's structural regions.
 *
 * "The light theme looks inconsistent" is a claim about the *rendered* surface,
 * not about the token file. This signs in, opens a surface in each theme, and
 * reports the computed background/ink of the structural primitives — the
 * sidebar, the top bar, cards, table rows and buttons — so a mismatch is a
 * number rather than an impression.
 *
 * Usage: node scripts/sample-admin-light.mjs
 */

import { chromium } from 'playwright';

const ADMIN = process.env.ORYX_ADMIN_BASE ?? 'http://127.0.0.1:12000';
const USER = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const PROBES = [
  '.oryx-sidebar',
  '.oryx-topbar',
  '.oryx-card',
  '.oryx-table thead th',
  '.oryx-table tbody tr',
  '.oryx-btn--primary',
  '.oryx-btn--ghost',
  '.oryx-input',
  '.oryx-stat-card',
  'body',
  '.oryx-main',
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

  console.log(`\n=== ${theme.toUpperCase()} ===`);
  for (const sel of PROBES) {
    const info = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const st = getComputedStyle(el);
      return {
        bg: st.backgroundColor,
        color: st.color,
        border: st.borderTopColor,
        bgImage: st.backgroundImage === 'none' ? null : st.backgroundImage.slice(0, 60),
      };
    }, sel);
    if (!info) {
      console.log(`  ${sel.padEnd(26)} (absent)`);
      continue;
    }
    console.log(
      `  ${sel.padEnd(26)} bg ${info.bg.padEnd(24)} ink ${info.color.padEnd(24)}` +
        (info.bgImage ? ` img(${info.bgImage})` : ''),
    );
  }
  await ctx.close();
}

await browser.close();
