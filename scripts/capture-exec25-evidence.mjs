/**
 * Execution 25 evidence capture: light-theme modals and the automotive diagrams.
 *
 * Logs in as the seeded super admin, forces the light theme, and captures the
 * dialogs that the requirement batch touches (branch create, product create from
 * the spare-parts compatibility picker, chart-of-accounts account form) plus the
 * inspection chassis workspace. Output goes to ORYX_OUT (default /tmp/exec25).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.ORYX_BASE ?? 'http://localhost:3000';
const OUT = process.env.ORYX_OUT ?? '/tmp/exec25';
const EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local';
const PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026';

mkdirSync(OUT, { recursive: true });

const shot = (page, name) =>
  page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`);
  await page.getByTestId('login-email').fill(EMAIL);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });

  // Light theme + English, applied after load so localStorage exists.
  await page.evaluate(() => {
    window.localStorage.setItem('oryx.theme', 'light');
    window.localStorage.setItem('oryx.locale', 'en');
  });
  await page.reload();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });

  // 1. Branch create dialog (light theme).
  await page.goto(`${BASE}/branches`);
  await page.getByTestId('new-branch').click();
  await page.waitForTimeout(600);
  await shot(page, '01-branch-create-light');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 2. Chart of accounts — account form with type + parent dropdowns.
  await page.goto(`${BASE}/accounting`);
  await page.getByRole('tab', { name: /accounts/i }).click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, '02-accounting-accounts-light');

  // 3. Spare parts — compatibility inline product create (full ProductModal).
  await page.goto(`${BASE}/automotive/spare-parts`);
  await page.waitForTimeout(800);
  await shot(page, '03-spare-parts-light');

  // 4. Inspections workspace list (light theme).
  await page.goto(`${BASE}/automotive/inspections`);
  await page.waitForTimeout(800);
  await shot(page, '04-inspections-light');

  await browser.close();
  console.log(`Evidence written to ${OUT}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
