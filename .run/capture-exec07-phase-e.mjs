/**
 * Execution 07 Phase E — light-theme evidence capture.
 *
 * Captures the five surfaces the owner asked for, in the light theme:
 *   1. homepage
 *   2. customer dashboard
 *   3. provider directory
 *   4. login page
 *   5. customer profile
 * plus a light-vs-dark comparison pair of the same surface.
 *
 * Each surface is shot in Arabic/RTL and English/LTR at desktop, tablet and
 * mobile, plus a 1440-wide light/dark pair. The manifest records the status,
 * horizontal overflow, the resolved body background and text colour, and the
 * WCAG contrast ratio of the body text against that background — so the theme
 * is verified by measurement, not by eye.
 *
 * Run with: node .run/capture-exec07-phase-e.mjs before|after
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const PHASE = process.argv[2] === 'before' ? 'before' : 'after';
const CUSTOMER = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const OUT = `docs/audit/exec07/phase-e/${PHASE}`;

const CUSTOMER_USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const WIDTHS = [
  ['desktop', { width: 1440, height: 1024 }],
  ['tablet', { width: 834, height: 1112 }],
  ['mobile', { width: 390, height: 844 }],
];

// [name, path, requiresAuth]
const SURFACES = [
  ['01-homepage', '/', false],
  ['02-dashboard', '/dashboard', true],
  ['03-providers', '/providers', false],
  ['04-login', '/login', false],
  ['06-profile', '/profile', true],
];

mkdirSync(OUT, { recursive: true });

/** Parses `rgb()` / `rgba()` into [r,g,b,a]. */
function parseRgb(value) {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

function relLuminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 2.1 contrast ratio, or null when either colour is translucent. */
function contrast(fg, bg) {
  const a = parseRgb(fg);
  const b = parseRgb(bg);
  if (!a || !b || a[3] < 1 || b[3] < 1) return null;
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

/** Effective background of an element, walking up past transparent ancestors. */
const READ_STYLE = () => {
  const el = document.body;
  const cs = getComputedStyle(el);
  let bg = cs.backgroundColor;
  let node = el;
  while ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && node.parentElement) {
    node = node.parentElement;
    bg = getComputedStyle(node).backgroundColor;
  }
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    dir: document.documentElement.getAttribute('data-dir') ?? document.documentElement.dir,
    bodyBackground: bg,
    bodyColor: cs.color,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(),
    surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
    bgToken: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
  };
};

const browser = await chromium.launch();
const manifest = [];

async function signIn(page) {
  await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(CUSTOMER_USER.email);
  await page.locator('input[type="password"]').first().fill(CUSTOMER_USER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/dashboard', { timeout: 45_000 });
  await page.waitForTimeout(2000);
}

async function shoot(page, name, path, width, locale, theme, viewport, requiresAuth = false) {
  if (new URL(page.url()).origin === 'null') {
    await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
  }
  await page.evaluate(
    ([l, t]) => {
      window.localStorage.setItem('oryx.customer.locale', l);
      window.localStorage.setItem('oryx.customer.theme', t);
    },
    [locale, theme],
  );
  const res = await page.goto(`${CUSTOMER}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  // The hero and category photography come from the CMS as background images,
  // which `networkidle` does not cover. Decode every background image before
  // the shot, otherwise the same surface renders with and without the photo and
  // the dark regression comparison reports a false colour shift.
  await page
    .evaluate(async () => {
      const urls = new Set();
      for (const el of document.querySelectorAll('*')) {
        const bg = getComputedStyle(el).backgroundImage;
        for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(m[1]);
      }
      await Promise.all(
        [...urls].map(
          (u) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = img.onerror = () => resolve();
              img.src = u;
            }),
        ),
      );
    })
    .catch(() => {});
  // The hero background starts as the bundled vector art and is replaced once
  // the CMS content resolves. Wait until it stops changing so the same surface
  // is captured with the same photograph on every run.
  await page
    .evaluate(async () => {
      const el = document.querySelector('.oryx-hero__media, .oryx-dash-hero__art');
      if (!el) return;
      let last = getComputedStyle(el).backgroundImage;
      let stable = 0;
      for (let i = 0; i < 40 && stable < 5; i += 1) {
        await new Promise((r) => setTimeout(r, 200));
        const now = getComputedStyle(el).backgroundImage;
        stable = now === last ? stable + 1 : 0;
        last = now;
      }
    })
    .catch(() => {});
  await page.waitForTimeout(1200);

  // A guarded surface that redirected to /login means the session was lost, so
  // the capture would show the login page under an authenticated surface's
  // name. Fail loudly instead of committing misleading evidence.
  const landed = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
  if (requiresAuth && landed !== path.replace(/\/$/, '')) {
    throw new Error(
      `${name}: expected authenticated ${path} but landed on ${landed} — the session did not restore (check the bundle's API base is same-origin)`,
    );
  }

  await page.screenshot({ path: `${OUT}/${name}-${width}-${locale}-${theme}.png` });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const style = await page.evaluate(READ_STYLE);
  manifest.push({
    route: path,
    width,
    viewport,
    locale,
    theme,
    status: res ? res.status() : 0,
    overflow,
    requiresAuth,
    landedPath: landed,
    ...style,
    contrast: contrast(style.bodyColor, style.bodyBackground),
  });
  console.log(
    `  ${name}-${width}-${locale}-${theme}  status=${res ? res.status() : 0} overflow=${overflow} contrast=${contrast(style.bodyColor, style.bodyBackground)}`,
  );
}

for (const [width, viewport] of WIDTHS) {
  for (const theme of ['light', 'dark']) {
    const authCtx = await browser.newContext({ viewport });
    const authPage = await authCtx.newPage();
    await authPage.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
    await signIn(authPage);
    for (const [name, path, requiresAuth] of SURFACES) {
      if (!requiresAuth) continue;
      for (const locale of ['en', 'ar']) {
        await shoot(authPage, name, path, width, locale, theme, viewport, true);
      }
    }
    await authCtx.close();

    const pubCtx = await browser.newContext({ viewport });
    const pubPage = await pubCtx.newPage();
    for (const [name, path, requiresAuth] of SURFACES) {
      if (requiresAuth) continue;
      for (const locale of ['en', 'ar']) {
        await shoot(pubPage, name, path, width, locale, theme, viewport);
      }
    }
    await pubCtx.close();
  }
}

// The comparison pair: same surface, same viewport, only the theme differs.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  for (const theme of ['light', 'dark']) {
    await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => window.localStorage.setItem('oryx.customer.theme', t), theme);
    await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/05-comparison-homepage-${theme}.png` });
    console.log(`  comparison-homepage-${theme}`);
  }
  await ctx.close();
}

await browser.close();
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
const bad = manifest.filter((m) => m.status >= 400 || m.overflow > 1);
console.log(`\n${manifest.length} captures; ${bad.length} with status>=400 or overflow`);
if (bad.length) {
  console.log(bad.map((b) => `  ${b.route} @${b.width} ${b.locale}/${b.theme} status=${b.status} overflow=${b.overflow}`).join('\n'));
}
console.log('->', OUT);
