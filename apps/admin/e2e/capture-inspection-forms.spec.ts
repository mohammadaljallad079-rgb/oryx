import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Screenshot capture for the vehicle-inspection entry forms and the printed
 * report. This spec asserts little about behaviour — the behavioural coverage
 * lives in execution-phase2-inspection.spec.ts — it drives the real interface
 * against the real API and writes the frames the owner asked for.
 *
 * Run: ../../node_modules/.bin/playwright test capture-inspection-forms
 * Output: docs/execution-reports/exec20-inspection/
 */
const OUT = '../../docs/execution-reports/exec20-inspection';

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function closeModal(page: Page): Promise<void> {
  if ((await page.locator('.oryx-modal').count()) === 0) return;
  await page.keyboard.press('Escape');
  await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 5000 }).catch(async () => {
    const btn = page.locator('.oryx-modal').first().getByRole('button').last();
    if (await btn.count()) await btn.click().catch(() => {});
  });
}

test.describe('Execution 20 — inspection form and print capture', () => {
  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
  });

  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['dark', 'light'] as const) {
      test(`capture inspection list, create form, picker and workspace (${locale}, ${theme})`, async ({ page }) => {
        await setTheme(page, theme);
        await setLocale(page, locale);
        const tag = `${locale}-${theme}`;

        await page.goto('/automotive/inspections', { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('inspections-page')).toBeVisible();
        await expect(page.getByTestId('inspection-jobs')).toBeVisible();
        await shot(page, `01-inspections-list-${tag}`);

        await page.getByTestId('new-inspection-job').click();
        await expect(page.locator('.oryx-modal')).toHaveCount(1);
        await expect(page.getByTestId('job-types')).toBeVisible();
        await shot(page, `02-inspection-create-form-${tag}`);

        // The customer field is a searchable picker with an inline create action;
        // open it so the search box and the "+ add" affordance are visible.
        await page.getByTestId('job-customer').locator('button').first().click();
        await expect(page.getByTestId('job-customer').locator('[role="option"]').first()).toBeVisible();
        await page.waitForTimeout(300);
        await shot(page, `03-customer-picker-search-${tag}`);

        await closeModal(page);
        await expect(page.locator('.oryx-modal')).toHaveCount(0);

        await page.locator('[data-testid^="open-job-"]').first().click();
        await page.waitForURL(/\/automotive\/inspections\/.+/);
        await page.waitForLoadState('networkidle');
        await shot(page, `04-inspection-workspace-${tag}`);
      });
    }
  }

  test('capture the documents register and the printed inspection report', async ({ page }) => {
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      await setLocale(page, 'ar');
      await page.goto('/documents', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('document-register')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot(page, `05-documents-register-ar-${theme}`);

      // Open the stored PDF for the first inspection report in the register.
      const open = page.locator('[data-testid^="register-open-"]').first();
      if (await open.count()) {
        await open.click();
        await expect(page.getByTestId('register-frame')).toBeVisible();
        await page.waitForTimeout(3000); // let the PDF viewer paint inside the iframe
        await shot(page, `06-inspection-report-print-preview-ar-${theme}`);
        await page.getByTestId('register-preview-close').click().catch(() => {});
        await expect(page.locator('.oryx-modal')).toHaveCount(0).catch(() => {});
      }
    }
  });
});
