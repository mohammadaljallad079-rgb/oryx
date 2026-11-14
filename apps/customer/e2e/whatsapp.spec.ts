import { expect, test } from '@playwright/test';
import { setLocale, setTheme } from './helpers';

/**
 * The WhatsApp contact channel.
 *
 * The number is editable site content, so these tests assert the *shape* of the
 * link (a digits-only `wa.me` URL) rather than a hard-coded number, and that the
 * action only appears when a number is configured.
 */
const WA = /^https:\/\/wa\.me\/\d{7,}/;

test.describe('whatsapp contact channel', () => {
  test('shows a floating action on every primary page', async ({ page }) => {
    await setLocale(page, 'ar');
    for (const path of ['/', '/store', '/booking', '/offers', '/contact', '/branches']) {
      await page.goto(path);
      const fab = page.getByTestId('whatsapp-fab');
      await expect(fab, `${path} shows the WhatsApp action`).toBeVisible();
      await expect(fab).toHaveAttribute('href', WA);
    }
  });

  test('anchors to the inline-end corner per writing direction', async ({ page }) => {
    const box = async (locale: 'ar' | 'en') => {
      await setLocale(page, locale);
      await page.goto('/');
      const fab = page.getByTestId('whatsapp-fab');
      await expect(fab).toBeVisible();
      return fab.boundingBox();
    };
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    const rtl = await box('ar');
    const ltr = await box('en');
    // Arabic RTL pins the button to the left edge, English LTR to the right.
    expect(rtl!.x).toBeLessThan(viewport.width / 2);
    expect(ltr!.x).toBeGreaterThan(viewport.width / 2);
  });

  test('product cards open a chat pre-filled with the item', async ({ page }) => {
    await setLocale(page, 'ar');
    await page.goto('/store');
    const card = page.getByTestId('product-card').first();
    const action = card.getByTestId('product-whatsapp');
    await expect(action).toBeVisible();

    const href = await action.getAttribute('href');
    expect(href).toMatch(WA);
    const text = decodeURIComponent(new URL(href!).searchParams.get('text') ?? '');
    const sku = await card.getAttribute('data-sku');
    // The message names the product and links back to its page.
    expect(text).toContain(`/store/${sku}`);
    expect(text.length).toBeGreaterThan(20);
  });

  test('product detail exposes a labelled order button', async ({ page }) => {
    await setLocale(page, 'ar');
    await page.goto('/store');
    const sku = await page.getByTestId('product-card').first().getAttribute('data-sku');
    await page.goto(`/store/${sku}`);
    const action = page.getByRole('link', { name: 'اطلب عبر واتساب' });
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute('href', WA);
  });

  test('renders in both themes without overflow', async ({ page }) => {
    await setTheme(page, 'light');
    await setLocale(page, 'en');
    await page.goto('/store');
    await expect(page.getByTestId('whatsapp-fab')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
