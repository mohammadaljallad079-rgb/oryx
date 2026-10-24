#!/usr/bin/env node
/**
 * Capture the ORYX ERP mobile app (web export) against the live API.
 *
 * The export is served same-origin by scripts/serve-erp-preview.mjs, so the
 * app's `/api` calls reach the NestJS API and every figure in a screenshot is
 * real tenant data. The app keeps its access token in memory, so the run signs
 * in once and then navigates inside the app instead of reloading a URL per
 * screen — a reload would drop the token.
 *
 * Each viewport is captured in English/LTR and Arabic/RTL, in both themes, by
 * driving the Account tab's own language and theme controls.
 *
 * Navigation notes:
 *  - Expo Router renders each bottom tab with `role="tab"`, so tabs are clicked
 *    by role and index. Their labels are localized and the app starts in the
 *    locale saved from the previous run, so labels are not a stable selector.
 *  - Records-hub cards are matched by the API path printed on the card, which is
 *    locale-independent. `:visible` is required because the tab screens stay
 *    mounted behind the pushed screen.
 *
 * Usage:
 *   ERP_PREVIEW_PORT=12010 node .run/capture-erp-app.mjs
 *
 * Output: docs/audit/exec07/phase-f-mobile/screenshots/<lang>/<viewport>-<theme>-<screen>.png
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PORT = Number(process.env.ERP_PREVIEW_PORT ?? 12010);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = join(process.cwd(), 'docs/audit/exec07/phase-f-mobile/screenshots');

const EMAIL = process.env.ORYX_ERP_EMAIL ?? 'erp.demo@oryx.local';
const PASSWORD =
  process.env.ORYX_ERP_PASSWORD ?? readFileSync('/tmp/oryx-demo-admin.pw', 'utf8').trim();

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
};

/** Tab indices, in the order `(app)/_layout.tsx` declares them. */
const TAB = { dashboard: 0, records: 1, invoice: 2, transfer: 3, account: 4 };

/** Language and theme buttons, per locale. */
const L = {
  en: { dark: 'Dark', light: 'Light' },
  ar: { dark: 'داكن', light: 'فاتح' },
};

/** Records-hub cards, matched by the API path shown on the card. */
const RESOURCES = [
  ['/sales/customers', 'customers'],
  ['/sales/invoices', 'invoices'],
  ['/inventory/products', 'products'],
  ['/inventory/movements', 'stock-movements'],
  ['/inventory/warehouses', 'warehouses'],
  ['/hr/employees', 'employees'],
  ['/accounting/journals', 'journals'],
];

let LANG = 'en';
let THEME = 'light';
let VIEWPORT = 'mobile';

async function shoot(page, name) {
  await page.screenshot({ path: join(OUT, LANG, `${VIEWPORT}-${THEME}-${name}.png`) });
  console.log(`  ${LANG}/${VIEWPORT}-${THEME}-${name}.png`);
}

async function tab(page, key) {
  await page.getByRole('tab').nth(TAB[key]).click({ timeout: 15000 });
  await page.waitForTimeout(2000);
}

/** Click the first candidate label that is present and visible. */
async function clickAny(page, labels, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const label of labels) {
      const locator = page.locator(`:text-is("${label}"):visible`).first();
      if ((await locator.count()) > 0) {
        await locator.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1500);
        return true;
      }
    }
    await page.waitForTimeout(400);
  }
  return false;
}

/** Drive the Account tab's language and theme controls. */
async function applyPreferences(page) {
  await tab(page, 'account');
  // The language buttons are labelled in the locale that is active right now.
  const switched =
    LANG === 'en'
      ? await clickAny(page, ['English', 'الإنجليزية'])
      : await clickAny(page, ['Arabic', 'العربية']);
  if (!switched) throw new Error(`could not switch language to ${LANG}`);
  await page.waitForTimeout(1500);
  const ok = await clickAny(page, [L[LANG][THEME]]);
  if (!ok) throw new Error(`could not select ${THEME} theme`);
  await page.waitForTimeout(1500);
}

async function signIn(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="login-email"]', { timeout: 30000 });
  await shoot(page, 'login');
  await page.fill('[data-testid="login-email"]', EMAIL);
  await page.fill('[data-testid="login-password"]', PASSWORD);
  await page.click('[data-testid="login-submit"]');
  // Either greeting proves the dashboard rendered with live data.
  await clickAny(page, ['Welcome', 'أهلاً'], 30000);
  await page.waitForTimeout(2500);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const lang of ['en', 'ar']) {
    for (const theme of ['light', 'dark']) {
      mkdirSync(join(OUT, lang), { recursive: true });
      for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
        LANG = lang;
        THEME = theme;
        VIEWPORT = vp;
        console.log(`\n[${lang}/${theme}/${vp}] ${viewport.width}x${viewport.height}`);

        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: 2,
          locale: lang === 'ar' ? 'ar-BH' : 'en-US',
        });
        const page = await context.newPage();
        page.on('pageerror', (e) => console.log(`  pageerror: ${e.message.split('\n')[0]}`));

        await signIn(page);
        await applyPreferences(page);

        await tab(page, 'dashboard');
        await shoot(page, 'dashboard');

        await tab(page, 'invoice');
        await shoot(page, 'invoice-builder');
        await tab(page, 'transfer');
        await shoot(page, 'transfer-builder');

        await tab(page, 'records');
        await shoot(page, 'records-hub');

        for (const [path, slug] of RESOURCES) {
          try {
            const card = page.locator(`:text-is("${path}"):visible`).first();
            await card.click({ timeout: 10000 });
            await page.waitForTimeout(2500);
            await shoot(page, slug);
            await tab(page, 'records');
          } catch (err) {
            console.log(`  ${slug}: skipped (${err.message.split('\n')[0]})`);
            await tab(page, 'records').catch(() => {});
          }
        }

        await tab(page, 'account');
        await shoot(page, 'account');
        await context.close();
      }
    }
  }

  await browser.close();
  console.log(`\nScreenshots written to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
