import { expect, test } from '@playwright/test';
import { MODULES } from '@oryx/shared';
import { setLocale, signIn } from './helpers';

/**
 * The Super Admin must see the whole platform, not a slice of it.
 *
 * The guarantee has two halves and both are pinned here against the running
 * app, not against the source:
 *
 * 1. **Platform scope (no company selected).** A platform principal holds the
 *    `platform.*` permissions and no tenant scope, so every platform-governance
 *    section and the full module catalogue are visible — a module that the
 *    selected plan would not license still shows in the catalogue as unlicensed.
 * 2. **Company scope (a company selected).** With the Enterprise company active
 *    the Super Admin holds that tenant's company-scope permissions, so every
 *    ERP group and every module entry the plan licenses must be present, and
 *    each module route must open without an application error.
 *
 * The API-side equivalent lives in the super-admin authorization suite; this
 * suite is the interface half of the same guarantee.
 */

/** The English heading each ERP group renders, from the dictionary. */
const ERP_GROUP_LABELS = [
  'Finance',
  'Commerce',
  'Operations',
  'Customer Platform',
  'Automotive',
  'Analytics',
  'Administration',
];

/** The platform-only section headings, from the dictionary. */
const PLATFORM_GROUPS = [
  'Ecosystem Control',
  'Platform Governance',
  'Website & Application Management',
];

/** Company-scoped section headings that appear once a company is selected. */
const COMPANY_SCOPED_GROUPS = ['Ecosystem Operations'];

test.describe('Super Admin sees every module and section', () => {
  test('the platform surface and the full module catalogue are visible', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    const nav = page.locator('.oryx-sidebar');
    await expect(nav).toBeVisible();

    for (const heading of PLATFORM_GROUPS) {
      await expect(
        nav.getByText(heading, { exact: true }).first(),
        `platform section "${heading}" must be visible to the Super Admin`,
      ).toBeVisible();
    }

    // The module catalogue is the platform-wide view: with no company selected
    // it must list every module, licensed or not.
    await page.goto('/modules');
    await expect(page.getByTestId('modules-page')).toBeVisible();
    for (const mod of MODULES) {
      await expect(
        page.getByTestId(`module-card-${mod.key}`),
        `module "${mod.key}" must appear in the catalogue for the Super Admin`,
      ).toHaveCount(1);
    }
  });

  test('the sidebar lists every ERP group and every module for a licensed tenant', async ({
    page,
  }) => {
    await signIn(page);
    await setLocale(page, 'en');

    // Select the Enterprise company so every licensed module is reachable; the
    // demo tenant deliberately does not license automotive.
    const companySelect = page.getByTestId('context-selector').locator('select').first();
    await companySelect.selectOption({ label: 'ORYX Auto Services — Internal ORYX' });
    // The branch scope is a searchable picker, enabled once a company is chosen.
    await expect(page.getByTestId('context-branch').locator('button')).toBeEnabled();

    const nav = page.locator('.oryx-sidebar');
    for (const label of ERP_GROUP_LABELS) {
      await expect(
        nav.getByText(label, { exact: true }).first(),
        `navigation group "${label}" must be visible to the Super Admin`,
      ).toBeVisible();
    }
    for (const label of COMPANY_SCOPED_GROUPS) {
      await expect(
        nav.getByText(label, { exact: true }).first(),
        `company-scoped section "${label}" must be visible once a company is selected`,
      ).toBeVisible();
    }

    for (const mod of MODULES) {
      await expect(
        nav.locator(`a[href="${mod.route}"]`).first(),
        `module "${mod.key}" (${mod.route}) must be visible to the Super Admin`,
      ).toHaveCount(1);
    }
  });

  test('every module route opens without an application error', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    const companySelect = page.getByTestId('context-selector').locator('select').first();
    await companySelect.selectOption({ label: 'ORYX Auto Services — Internal ORYX' });
    // The branch scope is a searchable picker, enabled once a company is chosen.
    await expect(page.getByTestId('context-branch').locator('button')).toBeEnabled();

    for (const mod of MODULES) {
      await page.goto(mod.route);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const body = await page.locator('body').innerText();
      expect(body, `${mod.route} must not raise a server error`).not.toContain(
        'Internal Server Error',
      );
      expect(body, `${mod.route} must not raise an application error`).not.toContain(
        'Application error',
      );
    }
  });
});
