/**
 * Execution 07 Phase E — capture the authenticated admin light theme.
 *
 * The owner's complaint was about the *look* of the light theme, and the
 * surfaces that carry cards, navigation, forms and tables sit behind the sign-in
 * wall. This captures them in both themes so the light correction can be
 * compared against the approved dark render.
 *
 * The admin bundle calls the API at an absolute origin, so a full page reload
 * presents no refresh cookie and bounces to `/login` (the repository's
 * documented hazard). Every surface is therefore reached by signing in fresh and
 * navigating *inside* the app, never by reloading a deep URL.
 *
 * The theme is injected with `addInitScript` so it is applied on the first paint.
 *
 * Usage: node scripts/capture-admin-light.mjs
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ADMIN = process.env.ORYX_ADMIN_BASE ?? 'http://127.0.0.1:12000';
const OUT = process.env.ORYX_OUT ?? 'docs/audit/exec07/phase-e-continuation';
const USER = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};

const SURFACES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'companies', path: '/companies' },
  { name: 'roles', path: '/roles' },
  { name: 'integrations', path: '/integrations' },
  { name: 'subscriptions', path: '/subscriptions' },
  { name: 'audit', path: '/audit' },
  { name: 'website', path: '/website' },
];

function bootstrap(theme, locale) {
  return `(() => {
    try {
      localStorage.setItem('oryx.theme', ${JSON.stringify(theme)});
      localStorage.setItem('oryx.locale', ${JSON.stringify(locale)});
    } catch {}
    const d = document.documentElement;
    d.setAttribute('data-theme', ${JSON.stringify(theme)});
    d.style.colorScheme = ${JSON.stringify(theme)};
    d.setAttribute('lang', ${JSON.stringify(locale)});
    d.setAttribute('data-dir', ${JSON.stringify(locale === 'ar' ? 'rtl' : 'ltr')});
    d.dir = ${JSON.stringify(locale === 'ar' ? 'rtl' : 'ltr')};
  })();`;
}

async function launchChromium() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/usr/bin/chromium' });
  }
}

const browser = await launchChromium();
mkdirSync(OUT, { recursive: true });

/** Sign in, open one surface in-app, screenshot it. Returns an error string or null. */
async function capture(theme, locale, viewport, surface, file) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(bootstrap(theme, locale));
  const page = await ctx.newPage();
  try {
    await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    await page.locator('input[type="email"], input[name="email"]').first().fill(USER.email);
    await page.locator('input[type="password"]').first().fill(USER.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(4000);

    if (surface.path !== '/dashboard') {
      const link = page
        .locator(`nav a[href="${surface.path}"], aside a[href="${surface.path}"]`)
        .first();
      if ((await link.count()) === 0) return `no nav entry for ${surface.path}`;
      await link.scrollIntoViewIfNeeded().catch(() => {});
      await link.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    if (page.url().includes('/login')) return 'bounced to /login';
    await page.screenshot({ path: file });
    return null;
  } finally {
    await ctx.close();
  }
}

let captured = 0;
for (const locale of ['ar', 'en']) {
  for (const theme of ['light', 'dark']) {
    for (const surface of SURFACES) {
      const file = `${OUT}/admin-${surface.name}-${locale}-${theme}.png`;
      const err = await capture(theme, locale, VIEWPORTS.desktop, surface, file);
      if (err) {
        console.log(`SKIP  admin/${surface.name} ${locale}/${theme}: ${err}`);
      } else {
        captured += 1;
        console.log(`ok    admin/${surface.name} ${locale}/${theme}`);
      }
    }
  }
}

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  for (const locale of ['ar', 'en']) {
    for (const surface of [SURFACES[0], SURFACES[1], SURFACES[3]]) {
      const file = `${OUT}/admin-${surface.name}-${vpName}-${locale}-light.png`;
      const err = await capture('light', locale, viewport, surface, file);
      if (err) {
        console.log(`SKIP  admin/${surface.name} ${vpName}/${locale}: ${err}`);
      } else {
        captured += 1;
        console.log(`ok    admin/${surface.name} ${vpName}/${locale}`);
      }
    }
  }
}

await browser.close();
console.log(`\n${captured} screenshot(s) written to ${OUT}`);
