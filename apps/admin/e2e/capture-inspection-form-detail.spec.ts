import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Close-up capture of the vehicle-inspection entry form only.
 *
 * The owner asked specifically for images of the input form, so this spec
 * screenshots the form itself (element-level, 2x device scale for legibility)
 * rather than the whole page: the modal, its identification cover, its type
 * list, the searchable pickers and the nested inline-create dialogs.
 *
 * Run: ../../node_modules/.bin/playwright test capture-inspection-form-detail
 * Output: docs/execution-reports/exec20-inspection-form/
 */
const OUT = '../../docs/execution-reports/exec20-inspection-form';

test.use({ deviceScaleFactor: 2 });

async function shotEl(target: import('@playwright/test').Locator, name: string): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await target.screenshot({ path: `${OUT}/${name}.png` });
}

test.describe('Execution 20 — inspection input form (close-up)', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }));
  test.beforeEach(async ({ page }) => signIn(page, ENTERPRISE_ADMIN));

  for (const theme of ['light', 'dark'] as const) {
    test(`inspection form detail (ar, ${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await setLocale(page, 'ar');
      await page.goto('/automotive/inspections', { waitUntil: 'domcontentloaded' });
      await page.getByTestId('inspections-page').waitFor();

      await page.getByTestId('new-inspection-job').click();
      await expect(page.locator('.oryx-modal')).toHaveCount(1);
      await expect(page.getByTestId('job-types')).toBeVisible();
      await page.waitForTimeout(400);

      // Whole form, then each block on its own for legibility.
      await shotEl(page.locator('.oryx-modal').first(), `form-00-full-ar-${theme}`);
      await shotEl(page.getByTestId('job-customer'), `form-01-customer-field-ar-${theme}`);
      await shotEl(page.getByTestId('job-vehicle-identity'), `form-02-identity-cover-ar-${theme}`);
      await shotEl(page.getByTestId('job-types'), `form-03-types-ar-${theme}`);

      // Searchable picker opened: in-list search + "+ add" affordance.
      await page.getByTestId('job-customer').locator('button').first().click();
      await expect(page.getByTestId('job-customer-search')).toBeVisible();
      await page.getByTestId('job-customer-search').fill('نور');
      await page.waitForTimeout(300);
      await shotEl(page.getByRole('listbox'), `form-04-customer-search-ar-${theme}`);
      await page.getByTestId('job-customer-search').fill('');
      await page.waitForTimeout(200);

      // The inline create dialog the "+ add" action opens: the full customer
      // form, not a reduced stub.
      await page.getByTestId('job-customer-create').click();
      // The inspection now uses the canonical full CustomerModal, including its
      // automatic code and bilingual fields, not a reduced inline stub.
      await expect(page.getByTestId('customer-code')).toBeVisible();
      await expect(page.getByTestId('customer-name-en')).toBeVisible();
      await expect(page.getByTestId('customer-name-ar')).toBeVisible();
      await shotEl(page.locator('.oryx-modal').last(), `form-05-inline-customer-create-ar-${theme}`);
    });
  }

  test('inspection form — add-vehicle inline dialog (ar, light)', async ({ page }) => {
    await setTheme(page, 'light');
    await setLocale(page, 'ar');
    await page.goto('/automotive/inspections', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('inspections-page').waitFor();
    await page.getByTestId('new-inspection-job').click();
    await expect(page.getByTestId('job-types')).toBeVisible();
    // A vehicle can only be added against a chosen customer, so select one first.
    await page.getByTestId('job-customer').locator('button').first().click();
    await page.getByRole('listbox').locator('[role="option"]').first().click();
    await page.waitForTimeout(400);
    await page.getByTestId('job-add-vehicle').click();
    await page.waitForTimeout(600);
    await shotEl(page.locator('.oryx-modal').last(), 'form-07-inline-vehicle-ar-light');
  });

  test('inspection form detail (en, light)', async ({ page }) => {
    await setTheme(page, 'light');
    await setLocale(page, 'en');
    await page.goto('/automotive/inspections', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('inspections-page').waitFor();
    await page.getByTestId('new-inspection-job').click();
    await expect(page.getByTestId('job-types')).toBeVisible();
    await page.waitForTimeout(400);
    await shotEl(page.locator('.oryx-modal').first(), 'form-00-full-en-light');
    await shotEl(page.getByTestId('job-vehicle-identity'), 'form-02-identity-cover-en-light');
    await shotEl(page.getByTestId('job-types'), 'form-03-types-en-light');
  });
});
