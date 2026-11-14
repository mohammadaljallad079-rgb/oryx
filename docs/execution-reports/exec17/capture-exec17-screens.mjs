#!/usr/bin/env node
// Capture real admin screens for the Execution 17 report: the inspection entry
// form, the inspection workspace, the invoice entry form and the print preview.
// Drives the live app at :12000 with a real login, so every figure is real data.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.ADMIN_BASE ?? 'http://127.0.0.1:12000';
const OUT = join(process.cwd(), 'docs/execution-reports/exec17/screens');
const EMAIL = 'admin@oryx-auto.local';
const PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026';

mkdirSync(OUT, { recursive: true });

const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(30_000);

  await page.goto(`${BASE}/login`);
  await page.getByTestId('login-email').fill(EMAIL);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 40_000 });

  // Arabic RTL, light theme (the owner reads Arabic).
  await page.evaluate(() => {
    window.localStorage.setItem('oryx.locale', 'ar');
    window.localStorage.setItem('oryx.theme', 'light');
  });
  await page.reload();
  await page.waitForSelector('[data-testid="dashboard"]', { timeout: 40_000 });

  // 1. Inspection list
  await page.goto(`${BASE}/automotive/inspections`);
  await page.waitForSelector('[data-testid="inspection-jobs"]');
  await shot(page, '01-inspections-list');

  // 2. Inspection create form (modal)
  await page.getByTestId('new-inspection-job').click();
  await page.waitForSelector('[data-testid="job-vehicle-identity"]');
  await shot(page, '02-inspection-create-form');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 3. Inspection workspace (the entry screen with the checklist)
  await page.goto(`${BASE}/automotive/inspections`);
  await page.waitForSelector('[data-testid="inspection-jobs"]');
  const openJob = page.locator('[data-testid^="open-job-"]').first();
  if (await openJob.count()) {
    await openJob.click();
    await page.waitForTimeout(2500);
    await shot(page, '03-inspection-workspace');
  }

  // 4. Sales invoice entry form (modal)
  await page.goto(`${BASE}/sales`);
  await page.waitForSelector('[data-testid="new-invoice"]');
  await shot(page, '04-sales-page');
  await page.getByTestId('new-invoice').click();
  await page.waitForTimeout(1200);
  await shot(page, '05-invoice-create-form');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 5. Documents register (where preview/print lives)
  await page.goto(`${BASE}/documents`);
  await page.waitForTimeout(2500);
  await shot(page, '06-documents-register');

  // 6. Print preview of the newest invoice, if a preview trigger is present.
  const preview = page.locator('[data-testid^="doc-preview-"]').first();
  if (await preview.count()) {
    await preview.click();
    await page.waitForTimeout(3500);
    await shot(page, '07-print-preview-modal');
  }

  await browser.close();
  console.log('captured into', OUT);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
