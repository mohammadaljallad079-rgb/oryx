import { expect, test, type Page } from '@playwright/test';
import { COMPANY_ADMIN, SUPER_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 20 — per-company typography and the editable module catalog.
 *
 * Two contracts that only a browser can confirm:
 *
 * 1. Typography is a *company* setting applied to the document root at runtime.
 *    Saving the section must repaint the shell without a reload, and switching
 *    the company must swap the scale back to that tenant's own values — a
 *    value that leaked across tenants would still pass an API test.
 * 2. The module catalog is editable from the platform screen: a rename lands in
 *    the database, is reflected on the dashboard tiles, and can be restored to
 *    the shipped definition. The catalog is global, so the suite restores the
 *    row it touched before it finishes.
 */

const TARGET_KEY = 'reports_analytics';
const EDITED_NAME_EN = 'Reports & Insights (e2e)';

async function rootVar(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
}

/** Open a module's editor, run `body`, and always close the modal afterwards. */
async function withModuleEditor(page: Page, key: string, body: () => Promise<void>): Promise<void> {
  await page.getByTestId(`module-edit-${key}`).click();
  await expect(page.getByTestId('module-name-en')).toBeVisible();
  try {
    await body();
  } finally {
    // The modal stays in the DOM after closing, so wait for the count to reach
    // zero rather than for the trigger to disappear.
    if (await page.getByTestId('module-name-en').isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /cancel|إلغاء/i }).click();
    }
    await expect(page.getByTestId('module-name-en')).toHaveCount(0);
  }
}

/**
 * Set a module's active flag to a known value and save.
 *
 * The switch is a toggle, so it is read first: a run that failed midway leaves
 * the row retired, and toggling blindly would flip it back to active and make
 * the next assertion meaningless.
 */
async function setModuleActive(page: Page, key: string, active: boolean): Promise<void> {
  await withModuleEditor(page, key, async () => {
    const toggle = page.getByTestId('module-active');
    if ((await toggle.getAttribute('aria-checked')) !== String(active)) await toggle.click();
    await page.getByTestId('module-save').click();
    await expect(page.getByTestId('modules-saved')).toBeVisible();
  });
}

test.describe('Execution 20 — per-company typography', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'light');
  });

  test('saving the typography section repaints the shell without a reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-tab-typography').click();
    await expect(page.getByTestId('settings-panel-typography')).toBeVisible();

    const field = page.getByTestId('setting-typography-baseSize');
    await expect(field).toBeVisible();
    const original = await field.inputValue();
    const next = original === '18' ? '17' : '18';

    const before = await rootVar(page, '--font-size-base');
    await field.fill(next);
    await page.getByTestId('save-settings-section').click();
    await expect(page.getByTestId('settings-section-saved')).toBeVisible();

    // The variable is written straight to the root: no reload was performed.
    await expect.poll(() => rootVar(page, '--font-size-base')).toBe(`${next}px`);
    expect(await rootVar(page, '--font-size-base')).not.toBe(before);

    // And a real heading follows it, so the change is not just a variable.
    const headingSize = await page
      .locator('h1, .oryx-panel-title')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    await field.fill(original);
    await page.getByTestId('save-settings-section').click();
    await expect.poll(() => rootVar(page, '--font-size-base')).toBe(`${original}px`);
    const restoredSize = await page
      .locator('h1, .oryx-panel-title')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(restoredSize).toBeLessThan(headingSize);
  });

  test('the scale survives a reload and is served from the tenant row', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-tab-typography').click();
    const field = page.getByTestId('setting-typography-baseSize');
    const original = await field.inputValue();
    await field.fill('17');
    await page.getByTestId('save-settings-section').click();
    await expect(page.getByTestId('settings-section-saved')).toBeVisible();

    await page.reload();
    await expect.poll(() => rootVar(page, '--font-size-base')).toBe('17px');

    await page.getByTestId('settings-tab-typography').click();
    await page.getByTestId('setting-typography-baseSize').fill(original);
    await page.getByTestId('save-settings-section').click();
    await expect.poll(() => rootVar(page, '--font-size-base')).toBe(`${original}px`);
  });
});

test.describe('Execution 20 — editable module catalog', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'light');
  });

  test('renames a module, reflects it on the tiles, then restores the shipped name', async ({ page }) => {
    await page.goto('/modules');
    await expect(page.getByTestId('modules-page')).toBeVisible();
    // A previous interrupted run could have left the row retired; the dashboard
    // tile assertions below need it active.
    await setModuleActive(page, TARGET_KEY, true);
    const card = page.getByTestId(`module-card-${TARGET_KEY}`);
    await expect(card).toBeVisible();
    const shippedName = (await card.locator('.oryx-panel-title').innerText()).trim();

    await withModuleEditor(page, TARGET_KEY, async () => {
      await page.getByTestId('module-name-en').fill(EDITED_NAME_EN);
      await page.getByTestId('module-save').click();
      await expect(page.getByTestId('modules-saved')).toBeVisible();
    });

    try {
      await expect(card.locator('.oryx-panel-title')).toHaveText(EDITED_NAME_EN);

      // The rename is a database write, so it reaches the dashboard tiles too.
      await page.goto('/dashboard');
      const tile = page.getByTestId(`tile-${TARGET_KEY}`);
      await expect(tile.locator('.oryx-tile__title')).toHaveText(EDITED_NAME_EN);
    } finally {
      // Restore the shipped definition, so both surfaces return to it and the
      // global catalog is left exactly as the seed wrote it.
      await page.goto('/modules');
      await withModuleEditor(page, TARGET_KEY, async () => {
        await page.getByTestId('module-restore').click();
        await expect(page.getByTestId('modules-saved')).toBeVisible();
      });
    }
    await expect(page.getByTestId(`module-card-${TARGET_KEY}`).locator('.oryx-panel-title')).toHaveText(
      shippedName,
    );
  });

  test('a retired module leaves the dashboard tiles', async ({ page }) => {
    try {
      await page.goto('/modules');
      await setModuleActive(page, TARGET_KEY, false);

      await page.goto('/dashboard');
      await expect(page.getByTestId('tile-dashboard')).toBeVisible();
      await expect(page.getByTestId(`tile-${TARGET_KEY}`)).toHaveCount(0);
    } finally {
      // The catalog is global, so the row is always put back even if an
      // assertion above fails — later suites read this row.
      await page.goto('/modules');
      await setModuleActive(page, TARGET_KEY, true);
    }

    await page.goto('/dashboard');
    await expect(page.getByTestId(`tile-${TARGET_KEY}`)).toBeVisible();
  });
});
