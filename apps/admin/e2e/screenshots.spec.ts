import { test } from '@playwright/test';
import { COMPANY_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Screenshot capture for the execution report. Output goes to
 * docs/execution-reports/screenshots/ (resolved relative to the repo root).
 *
 * These are real renders of the running application — dark and light themes,
 * Arabic RTL and English LTR, desktop and mobile viewports.
 */

const OUT = '../../docs/execution-reports/screenshots';

test.describe('screenshots', () => {
  test('desktop dark theme dashboard', async ({ page }) => {
    await signIn(page);
    await setTheme(page, 'dark');
    await setLocale(page, 'en');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/desktop-dark-dashboard.png`, fullPage: false });
    await page.screenshot({ path: `${OUT}/desktop-dark-dashboard-full.png`, fullPage: true });
  });

  test('desktop light theme dashboard', async ({ page }) => {
    await signIn(page);
    await setTheme(page, 'light');
    await setLocale(page, 'en');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/desktop-light-dashboard.png`, fullPage: false });
    await page.screenshot({ path: `${OUT}/desktop-light-dashboard-full.png`, fullPage: true });
  });

  test('desktop arabic RTL dashboard', async ({ page }) => {
    await signIn(page);
    await setTheme(page, 'dark');
    await setLocale(page, 'ar');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/desktop-dark-ar-dashboard.png`, fullPage: false });
  });

  test('mobile dark and light dashboards', async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await setTheme(page, 'dark');
    await setLocale(page, 'en');
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/mobile-dark-dashboard.png`, fullPage: true });

    await setTheme(page, 'light');
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/mobile-light-dashboard.png`, fullPage: true });
  });

  test('company management screen', async ({ page }) => {
    await signIn(page);
    await setTheme(page, 'dark');
    await setLocale(page, 'en');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/companies');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/desktop-dark-companies.png`, fullPage: false });
  });

  test('subscription packages screen', async ({ page }) => {
    await signIn(page);
    await setTheme(page, 'dark');
    await setLocale(page, 'en');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/plans');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/desktop-dark-plans.png`, fullPage: true });
  });

  test('roles and permissions screen', async ({ page }) => {
    await signIn(page);
    await setTheme(page, 'dark');
    await setLocale(page, 'en');
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/roles');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/desktop-dark-roles.png`, fullPage: true });
  });

  test('light theme company management', async ({ page }) => {
    await signIn(page);
    await setTheme(page, 'light');
    await setLocale(page, 'en');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/companies');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/desktop-light-companies.png`, fullPage: false });
  });

  test('login screen dark and light', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // localStorage is only available once a document is loaded, so visit the
    // page first and then apply the persisted preferences.
    await page.goto('/login');
    await setTheme(page, 'dark');
    await setLocale(page, 'en');
    await page.goto('/login');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/desktop-dark-login.png`, fullPage: false });

    await setTheme(page, 'light');
    await page.goto('/login');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/desktop-light-login.png`, fullPage: false });
  });

  test('company administrator restricted view', async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setTheme(page, 'dark');
    await setLocale(page, 'en');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/desktop-dark-company-admin.png`, fullPage: true });
  });

  test('planned module state', async ({ page }) => {
    await signIn(page);
    await setTheme(page, 'dark');
    await setLocale(page, 'en');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/accounting');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/desktop-dark-planned-module.png`, fullPage: true });
  });
});
