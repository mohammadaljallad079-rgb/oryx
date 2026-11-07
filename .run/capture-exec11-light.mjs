/**
 * Execution 11 — live light-theme verification capture.
 *
 * The customer session is held in memory and re-acquired from the HttpOnly
 * refresh cookie. A `page.goto` reload between captures therefore races the
 * refresh and can bounce an authenticated surface to /login (the documented
 * Execution 07 hazard). To avoid it, the theme and locale are injected with
 * `addInitScript` so they are applied on the first paint, and the authenticated
 * dashboard is captured immediately after the sign-in redirect with no reload.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const CUSTOMER = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const ADMIN = process.env.ORYX_ADMIN_BASE ?? 'http://127.0.0.1:3000';
const OUT = 'docs/audit/exec11/light-theme';
mkdirSync(OUT, { recursive: true });

const CUSTOMER_USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };
const ADMIN_USER = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL || 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD,
};

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};

const SURFACES = [
  { name: '01-homepage', path: '/', auth: false },
  { name: '02-dashboard', path: '/dashboard', auth: true },
  { name: '03-providers', path: '/providers', auth: false },
  { name: '04-login', path: '/login', auth: false },
];

// The bootstrap in each app's layout reads these exact keys, so they are the
// only ones that survive a reload. See apps/customer/src/app/layout.tsx.
function initScript(theme, locale, scope) {
  const prefix = scope === 'admin' ? 'oryx' : 'oryx.customer';
  return `(() => {
    try {
      localStorage.setItem('${prefix}.theme', ${JSON.stringify(theme)});
      localStorage.setItem('${prefix}.locale', ${JSON.stringify(locale)});
    } catch {}
    document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
    document.documentElement.style.colorScheme = ${JSON.stringify(theme)};
    document.documentElement.setAttribute('lang', ${JSON.stringify(locale)});
    document.documentElement.setAttribute('dir', ${JSON.stringify(locale === 'ar' ? 'rtl' : 'ltr')});
  })();`;
}

async function newCtx(browser, theme, locale, viewport, scope = 'customer') {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(initScript(theme, locale, scope));
  return ctx;
}

const browser = await chromium.launch();

// ------------------------------------------------------------- customer
for (const vpName of ['desktop', 'tablet', 'mobile']) {
  for (const locale of ['ar', 'en']) {
    for (const surface of SURFACES) {
      const ctx = await newCtx(browser, 'light', locale, VIEWPORTS[vpName]);
      const page = await ctx.newPage();
      if (surface.auth) {
        // Sign in on /login; a successful sign-in redirects to /dashboard and
        // keeps the in-memory token, so capture without a further navigation.
        await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        const email = page.locator('input[type="email"], input[name="email"]').first();
        const pw = page.locator('input[type="password"]').first();
        await email.fill(CUSTOMER_USER.email);
        await pw.fill(CUSTOMER_USER.password);
        await page.locator('button[type="submit"]').first().click();
        await page.waitForURL('**/dashboard', { timeout: 45_000 });
        await page.waitForTimeout(2500);
        if (!page.url().includes('/dashboard')) {
          throw new Error(`${surface.name}: sign-in did not reach /dashboard (landed ${page.url()})`);
        }
      } else {
        await page.goto(`${CUSTOMER}${surface.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1800);
      }
      await page.screenshot({
        path: `${OUT}/${surface.name}-${vpName}-${locale}-light.png`,
        fullPage: true,
      });
      console.log(`captured ${surface.name} ${vpName} ${locale} light`);
      await ctx.close();
    }
  }
}

// ------------------------------------------------------- admin (ivory)
for (const locale of ['ar', 'en']) {
  for (const theme of ['light', 'dark']) {
    const ctx = await newCtx(browser, theme, locale, VIEWPORTS.desktop, 'admin');
    const page = await ctx.newPage();
    await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const email = page.locator('input[type="email"], input[name="email"]').first();
    const pw = page.locator('input[type="password"]').first();
    await email.fill(ADMIN_USER.email);
    await pw.fill(ADMIN_USER.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(4000);
    await page.goto(`${ADMIN}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: `${OUT}/05-admin-dashboard-desktop-${locale}-${theme}.png`,
      fullPage: true,
    });
    console.log(`captured admin dashboard ${locale} ${theme}`);
    await ctx.close();
  }
}

await browser.close();
console.log('done');
