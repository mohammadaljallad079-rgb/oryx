import { test, type Page } from '@playwright/test';
import { addFirstProductToCart, setLocale, setTheme, signIn } from './helpers';

/**
 * Screenshot capture for the public website execution report.
 *
 * Output: docs/execution-reports/screenshots/ (resolved from the repo root).
 * Real renders of the running site in both themes and both directions at
 * desktop and mobile widths.
 */

const OUT = '../../docs/execution-reports/screenshots';

const PAGES: Array<[name: string, path: string]> = [
  ['home', '/'],
  ['services', '/services'],
  ['booking', '/booking'],
  ['store', '/store'],
  ['branches', '/branches'],
  ['about', '/about'],
  ['contact', '/contact'],
  ['offers', '/offers'],
];

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(900);
}

for (const [name, path] of PAGES) {
  test(`${name} - arabic dark desktop`, async ({ page }) => {
    await setLocale(page, 'ar');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(path);
    await settle(page);
    await page.screenshot({ path: `${OUT}/customer-${name}-ar-dark.png` });
    await page.screenshot({ path: `${OUT}/customer-${name}-ar-dark-full.png`, fullPage: true });
  });

  test(`${name} - english light desktop`, async ({ page }) => {
    await setLocale(page, 'en');
    await setTheme(page, 'light');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(path);
    await settle(page);
    await page.screenshot({ path: `${OUT}/customer-${name}-en-light.png` });
  });
}

for (const [name, path] of PAGES.slice(0, 4)) {
  test(`${name} - arabic dark mobile`, async ({ page }) => {
    await setLocale(page, 'ar');
    await setTheme(page, 'dark');
    await page.goto(path);
    await settle(page);
    await page.screenshot({ path: `${OUT}/customer-${name}-mobile-ar-dark.png`, fullPage: true });
  });
}

test('product detail - arabic dark desktop', async ({ page }) => {
  await setLocale(page, 'ar');
  await setTheme(page, 'dark');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/store/TYRE-205-55R16');
  await settle(page);
  await page.screenshot({ path: `${OUT}/customer-product-ar-dark.png` });
  await page.screenshot({ path: `${OUT}/customer-product-ar-dark-full.png`, fullPage: true });
});

test('product detail - english light desktop', async ({ page }) => {
  await setLocale(page, 'en');
  await setTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/store/TYRE-205-55R16');
  await settle(page);
  await page.screenshot({ path: `${OUT}/customer-product-en-light.png` });
});

test('cart - arabic dark desktop', async ({ page }) => {
  await setLocale(page, 'ar');
  await setTheme(page, 'dark');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await addFirstProductToCart(page);
  await page.goto('/cart');
  await settle(page);
  await page.screenshot({ path: `${OUT}/customer-cart-ar-dark.png` });
});

test('checkout - arabic dark desktop', async ({ page }) => {
  await setLocale(page, 'ar');
  await setTheme(page, 'dark');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await addFirstProductToCart(page);
  await signIn(page);
  await page.goto('/checkout');
  await settle(page);
  await page.screenshot({ path: `${OUT}/customer-checkout-ar-dark.png` });
});

test('checkout - english light desktop', async ({ page }) => {
  await setLocale(page, 'en');
  await setTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await addFirstProductToCart(page);
  await signIn(page);
  await page.goto('/checkout');
  await settle(page);
  await page.screenshot({ path: `${OUT}/customer-checkout-en-light.png` });
});
