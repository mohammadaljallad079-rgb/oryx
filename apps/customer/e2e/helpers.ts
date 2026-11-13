import { expect, type Page } from '@playwright/test';

export const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

export const DEMO_CUSTOMER = {
  email: process.env.SEED_CUSTOMER_EMAIL ?? 'customer@oryx-auto.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

/** The site renders Arabic RTL dark by default; tests set what they assert. */
export async function setLocale(page: Page, locale: 'ar' | 'en'): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('oryx.customer.locale', value);
  }, locale);
}

export async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('oryx.customer.theme', value);
  }, theme);
}

/** Sign in through the real form so the HttpOnly refresh cookie is established. */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(DEMO_CUSTOMER.email);
  await page.getByTestId('login-password').fill(DEMO_CUSTOMER.password);
  await page.getByRole('button', { name: /دخول|Sign in/ }).click();
  await page.waitForURL(/dashboard/, { timeout: 30_000 });
}

/** Add the first in-stock catalogue product to the cart from the store page. */
export async function addFirstProductToCart(page: Page): Promise<string> {
  await page.goto('/store');
  const card = page.getByTestId('product-card').first();
  await expect(card).toBeVisible();
  const sku = await card.getAttribute('data-sku');
  await card.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText(/[1-9]/);
  return sku ?? '';
}

/**
 * Clear the stored cart so tests do not leak state into one another.
 *
 * This must run once on a loaded page rather than through `addInitScript`,
 * which would re-run on every navigation and wipe the cart again right after
 * the test added a line to it.
 */
export async function clearCart(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.removeItem('oryx.customer.cart'));
}
