import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { COMPANY_ADMIN, ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 20 evidence capture — before/after pairs.
 *
 * Writes a deterministic set of screenshots for every surface Execution 20
 * changes, in both themes, so the report can show a real before/after. The
 * output directory is selected with `E20_PHASE=before|after`.
 *
 * The automotive surfaces are Enterprise-licensed, so they are captured with
 * the automotive tenant rather than the demo tenant.
 */
const PHASE = process.env.E20_PHASE ?? 'before';
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
