import { expect, type Page } from '@playwright/test';

export const SUPER_ADMIN = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

export const COMPANY_ADMIN = {
  email: 'admin@demo-alnoor.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

/** Signs in through the real login form and waits for the dashboard. */
export async function signIn(page: Page, credentials = SUPER_ADMIN): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(credentials.email);
  await page.getByTestId('login-password').fill(credentials.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await expect(page.getByTestId('dashboard')).toBeVisible();
}

/** Switches the theme and waits for the attribute to settle. */
export async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((value) => {
    window.localStorage.setItem('oryx.theme', value);
  }, theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Switches locale/direction and waits for the attribute to settle. */
export async function setLocale(page: Page, locale: 'ar' | 'en'): Promise<void> {
  await page.evaluate((value) => {
    window.localStorage.setItem('oryx.locale', value);
  }, locale);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-dir', locale === 'ar' ? 'rtl' : 'ltr');
}

export async function expectNoServerError(page: Page): Promise<void> {
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Application error');
  expect(body).not.toContain('Internal Server Error');
}
