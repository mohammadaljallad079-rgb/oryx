import { expect, test } from '@playwright/test';
import { SUPER_ADMIN, setLocale, signIn } from './helpers';

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

/**
 * Website Settings — the sidebar entry that opens the public-website editor.
 *
 * Proves three things end to end against the real API and database:
 *   1. an authorized (platform) principal sees the entry and can open the page;
 *   2. saving writes through the existing site-content endpoint;
 *   3. the saved value is what the public website reads.
 */
test.describe('website settings', () => {
  test('is reachable from the sidebar and saves to the public site', async ({ page, request }) => {
    // Read the current value so the test can restore it afterwards.
    const before = await request.get(`${API}/cms/public/content?locale=en`);
    expect(before.ok()).toBeTruthy();
    const beforeBody = (await before.json()) as { site: { contact: { phone: string } } };
    const originalPhone = beforeBody.site.contact.phone;

    await signIn(page, SUPER_ADMIN);
    // The admin defaults to Arabic; assert the English label deterministically.
    await setLocale(page, 'en');

    const navEntry = page.getByRole('link', { name: 'Website Settings' });
    await expect(navEntry).toBeVisible();
    await navEntry.click();

    await expect(page).toHaveURL(/\/website\/settings$/);
    await expect(page.getByTestId('website-settings-page')).toBeVisible();
    await expect(page.getByTestId('site-content-editor')).toBeVisible();
    // The editor keeps its own locale toggle, defaulting to Arabic; pick English
    // so the assertion reads the document this test edits.
    await page.getByTestId('site-content-locale-en').click();

    const phoneField = page.getByTestId('site-contact-phone');
    await expect(phoneField).toHaveValue(originalPhone);

    const probe = '+973 1111 2222';
    try {
      await phoneField.fill(probe);
      await page.getByTestId('site-content-save').click();
      await expect(page.getByTestId('site-content-saved')).toBeVisible();

      // The public site reads the same document.
      const after = await request.get(`${API}/cms/public/content?locale=en`);
      const afterBody = (await after.json()) as { site: { contact: { phone: string } } };
      expect(afterBody.site.contact.phone).toBe(probe);
    } finally {
      await phoneField.fill(originalPhone);
      await page.getByTestId('site-content-save').click();
      await expect(page.getByTestId('site-content-saved')).toBeVisible();
    }
  });
});
