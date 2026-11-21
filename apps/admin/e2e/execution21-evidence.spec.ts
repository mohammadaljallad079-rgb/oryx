import { test } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

const OUT = '../../docs/execution-reports/exec21';

/**
 * Visual evidence for the Execution 21 redesign: the reports workspace and the
 * workshop landing screen, in both languages and both themes, plus the report
 * PDF preview modal and a light-theme dialog.
 */
test('evidence: reports workspace (en, dark)', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await setTheme(page, 'dark');
  await page.goto('/reports');
  await page.getByTestId('report-list').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/reports-en-dark.png`, fullPage: true });
});

test('evidence: reports workspace (ar, light)', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'ar');
  await setTheme(page, 'light');
  await page.goto('/reports');
  await page.getByTestId('report-list').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/reports-ar-light.png`, fullPage: true });
});

test('evidence: report PDF preview modal', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await setTheme(page, 'dark');
  await page.goto('/reports');
  await page.getByTestId('report-list').waitFor({ timeout: 20_000 });
  await page.getByTestId('report-tile-sales-summary').click();
  await page.getByTestId('report-preview').click();
  await page.getByTestId('report-preview-body').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/reports-pdf-preview-en-dark.png` });
});

test('evidence: workshop landing (en, dark)', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await setTheme(page, 'dark');
  await page.goto('/automotive/maintenance');
  await page.getByTestId('workshop-dashboard').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/workshop-en-dark.png`, fullPage: true });
});

test('evidence: workshop landing (ar, light)', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'ar');
  await setTheme(page, 'light');
  await page.goto('/automotive/maintenance');
  await page.getByTestId('workshop-dashboard').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/workshop-ar-light.png`, fullPage: true });
});

test('evidence: new job card dialog (light)', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await setTheme(page, 'light');
  await page.goto('/automotive/maintenance');
  await page.getByTestId('new-job-card').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/workshop-new-job-card-light.png` });
});
