import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { COMPANY_ADMIN, ENTERPRISE_ADMIN, SUPER_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 20 evidence capture — before/after pairs.
 *
 * Writes a deterministic set of screenshots for every surface Execution 20
 * changes, in both themes, so the report can show a real before/after. The
 * output directory is selected with `E20_PHASE=before|after` and defaults to
 * `after` — the phase that matches the current code — so an ordinary full-suite
 * run regenerates the current evidence instead of overwriting the frozen
 * `before/` baseline. Set `E20_PHASE=before` only for a deliberate re-baseline.
 *
 * The automotive surfaces are Enterprise-licensed, so they are captured with
 * the automotive tenant rather than the demo tenant.
 */
const PHASE = process.env.E20_PHASE ?? 'after';
// Playwright runs from `apps/admin`, so the evidence lands in the repo-root docs.
const OUT = `../../docs/execution-reports/execution20/${PHASE}`;

const STAFF_PAGES: Array<[string, string]> = [
  ['dashboard', '/dashboard'],
  ['overview', '/dashboard/overview'],
  ['accounting', '/accounting'],
  ['sales', '/sales'],
  ['purchasing', '/purchasing'],
  ['inventory', '/inventory'],
  ['hr', '/hr'],
  ['crm', '/crm'],
  ['operations', '/operations'],
  ['payments', '/payments'],
  ['documents', '/documents'],
  ['settings', '/settings'],
];

const AUTO_PAGES: Array<[string, string]> = [
  ['maintenance', '/automotive/maintenance'],
  ['inspections', '/automotive/inspections'],
  ['spare-parts', '/automotive/spare-parts'],
];

/**
 * Surfaces Execution 20's visual/typography work adds.
 *
 * The module catalog editor and the typography section did not exist in the
 * "before" phase, so there is no matching pair; they are captured in the same
 * directory as the rest so the report can show them alongside the others.
 */
const NEW_SURFACES: Array<[string, string]> = [
  ['modules', '/modules'],
  ['settings-typography', '/settings'],
];

async function captureNewSurfaces(page: Page, dir: string): Promise<void> {
  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);
    for (const [name, path] of NEW_SURFACES) {
      await page.goto(path);
      if (name === 'settings-typography') {
        await page.getByTestId('settings-tab-typography').click();
        await expect(page.getByTestId('settings-panel-typography')).toBeVisible();
      }
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${dir}/${name}-${theme}.png`, fullPage: true });
    }
  }
}

test.describe('Execution 20 — evidence', () => {
  test('captures staff surfaces in dark and light', async ({ page }) => {
    mkdirSync(`${OUT}/ar`, { recursive: true });
    mkdirSync(`${OUT}/en`, { recursive: true });
    await signIn(page, COMPANY_ADMIN);

    for (const [locale, dir] of [['ar', 'ar'], ['en', 'en']] as const) {
      await setLocale(page, locale);
      for (const theme of ['dark', 'light'] as const) {
        await setTheme(page, theme);
        for (const [name, path] of STAFF_PAGES) {
          await page.goto(path);
          await page.waitForTimeout(1200);
          await page.screenshot({ path: `${OUT}/${dir}/${name}-${theme}.png`, fullPage: true });
        }
      }
    }
  });

  test('captures the module catalog and typography surfaces', async ({ page }) => {
    // These surfaces are new in Execution 20, so there is no pre-change
    // baseline to capture; writing one would present the current build as its
    // own "before". They are captured in the after phase only.
    test.skip(PHASE === 'before', 'No pre-change baseline exists for these surfaces.');
    mkdirSync(`${OUT}/en`, { recursive: true });
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await captureNewSurfaces(page, 'en');
  });

  test('captures automotive surfaces with the enterprise tenant', async ({ page }) => {
    mkdirSync(`${OUT}/auto`, { recursive: true });
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'ar');
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      for (const [name, path] of AUTO_PAGES) {
        await page.goto(path);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${OUT}/auto/${name}-${theme}.png`, fullPage: true });
      }
    }
  });
});
