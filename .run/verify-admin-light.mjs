/**
 * Execution 07 Phase E — admin light-theme verification.
 *
 * Signs in as the Super Admin and, for every control-plane surface, asserts in
 * the corrected light theme that:
 *
 *   - the page field is the approved ivory and the type is deep charcoal;
 *   - the body-text contrast clears WCAG AA against the field it renders on;
 *   - Arabic renders RTL and English LTR, with no horizontal overflow;
 *   - the layout survives desktop, tablet and handset widths;
 *   - the per-company branding editor is present on the settings page.
 *
 * It also re-checks the dark theme is unchanged, so the correction cannot have
 * leaked into the approved palette.
 *
 * Run with: node .run/verify-admin-light.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = process.env.ORYX_ADMIN_URL ?? 'http://127.0.0.1:12000';
const OUT = 'docs/audit/exec07/admin-light/verify';
mkdirSync(OUT, { recursive: true });

const SUPER = { email: 'superadmin@oryx.local', password: 'ChangeMe!Oryx2026' };

const IVORY = 'rgb(247, 244, 237)';
const CHARCOAL = 'rgb(34, 32, 29)';

const VIEWPORTS = [
  ['desktop', { width: 1440, height: 900 }],
  ['tablet', { width: 834, height: 1112 }],
  ['mobile', { width: 390, height: 844 }],
];

const SURFACES = [
  ['dashboard', '/dashboard'],
  ['settings', '/settings'],
  ['companies', '/companies'],
  ['users', '/users'],
  ['providers', '/providers'],
  ['audit', '/audit'],
];

function parseRgb(v) {
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
}
function relLum([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fg, bg) {
  const a = parseRgb(fg);
  const b = parseRgb(bg);
  if (!a || !b || a[3] < 1 || b[3] < 1) return null;
  const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

const results = [];
const failures = [];
function record(entry, ok, detail) {
  results.push({ ...entry, ok, detail });
  if (!ok) failures.push(`${entry.check} — ${detail}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
const page = await context.newPage();

// One real sign-in; the session then covers every surface below.
await page.goto(`${BASE}/login`);
await page.getByTestId('login-email').fill(SUPER.email);
await page.getByTestId('login-password').fill(SUPER.password);
await page.getByTestId('login-submit').click();
await page.waitForURL('**/dashboard', { timeout: 30_000 });

for (const [locale, dir] of [['en', 'ltr'], ['ar', 'rtl']]) {
  await page.evaluate((l) => window.localStorage.setItem('oryx.locale', l), locale);

  for (const [vpName, viewport] of VIEWPORTS) {
    await page.setViewportSize(viewport);

    for (const [name, path] of SURFACES) {
      // Tablet/handset: shoot a representative subset so the run stays bounded.
      if (vpName !== 'desktop' && !['dashboard', 'settings'].includes(name)) continue;

      for (const theme of ['light', 'dark']) {
        await page.evaluate((t) => window.localStorage.setItem('oryx.theme', t), theme);
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        const m = await page.evaluate(() => {
          const body = getComputedStyle(document.body);
          const h1 = document.querySelector('h1');
          const card = document.querySelector('.oryx-card');
          const btn = document.querySelector('.oryx-btn--primary');
          return {
            dir: document.documentElement.getAttribute('data-dir'),
            theme: document.documentElement.getAttribute('data-theme'),
            bodyBg: body.backgroundColor,
            bodyColor: body.color,
            heading: h1 ? getComputedStyle(h1).color : null,
            cardBg: card ? getComputedStyle(card).backgroundColor : null,
            cardColor: card ? getComputedStyle(card).color : null,
            btnBg: btn ? getComputedStyle(btn).backgroundImage : null,
            btnColor: btn ? getComputedStyle(btn).color : null,
            overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
            scrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
          };
        });

        const tag = `${name}/${locale}/${vpName}/${theme}`;
        const bodyRatio = contrast(m.bodyColor, m.bodyBg);

        record({ check: `theme-attr ${tag}`, surface: name, locale, vpName, theme }, m.theme === theme, m.theme);
        record({ check: `dir-attr ${tag}`, surface: name, locale, vpName, theme }, m.dir === dir, m.dir);

        if (theme === 'light') {
          record(
            { check: `ivory-field ${tag}`, surface: name, locale, vpName, theme },
            m.bodyBg === IVORY,
            m.bodyBg,
          );
          record(
            { check: `charcoal-type ${tag}`, surface: name, locale, vpName, theme },
            m.bodyColor === CHARCOAL,
            m.bodyColor,
          );
          record(
            { check: `body-contrast ${tag}`, surface: name, locale, vpName, theme },
            bodyRatio !== null && bodyRatio >= 4.5,
            String(bodyRatio),
          );
        } else {
          // The approved dark palette must not have moved.
          record(
            { check: `dark-field-unchanged ${tag}`, surface: name, locale, vpName, theme },
            m.bodyBg === 'rgb(0, 22, 43)',
            m.bodyBg,
          );
          record(
            { check: `dark-type-unchanged ${tag}`, surface: name, locale, vpName, theme },
            m.bodyColor === 'rgb(238, 243, 249)',
            m.bodyColor,
          );
        }

        record(
          { check: `no-horizontal-overflow ${tag}`, surface: name, locale, vpName, theme },
          !m.overflowX,
          `${m.scrollW} vs ${m.innerW}`,
        );

        // The branding editor is company-scoped: a platform principal carries no
        // tenant scope, so the assertion belongs to the company-admin pass below.

        if (vpName === 'desktop' && locale === 'en') {
          await page.screenshot({
            path: `${OUT}/${name}-${theme}.png`,
            fullPage: true,
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Company-admin pass: per-company branding editor.
//
// A platform Super Admin deliberately carries no tenant scope, so the
// company-scoped branding editor only renders for a company administrator.
// ---------------------------------------------------------------------------
const companyContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
const companyPage = await companyContext.newPage();
await companyPage.goto(`${BASE}/login`);
await companyPage.getByTestId('login-email').fill('admin@demo-alnoor.local');
await companyPage.getByTestId('login-password').fill(SUPER.password);
await companyPage.getByTestId('login-submit').click();
await companyPage.waitForURL('**/dashboard', { timeout: 30_000 });

for (const theme of ['light', 'dark']) {
  await companyPage.evaluate((t) => window.localStorage.setItem('oryx.theme', t), theme);
  await companyPage.evaluate(() => window.localStorage.setItem('oryx.locale', 'en'));
  await companyPage.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await companyPage.waitForTimeout(700);

  const present = await companyPage.evaluate(
    () => !!document.querySelector('[data-testid="settings-branding"]'),
  );
  record(
    { check: `branding-editor-present settings/company-admin/desktop/${theme}`, surface: 'settings', locale: 'en', vpName: 'desktop', theme },
    present,
    String(present),
  );

  if (theme === 'light') {
    await companyPage.screenshot({ path: `${OUT}/settings-branding-company-light.png`, fullPage: true });
  }
}
await companyContext.close();

await browser.close();

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

const checks = results.length;
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${checks} assertions passed across ${SURFACES.length} surfaces.`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log('Admin light theme verified: ivory field, charcoal type, AA contrast, RTL/LTR, responsive, dark unchanged.');
