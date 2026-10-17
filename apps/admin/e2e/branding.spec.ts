import { expect, test } from '@playwright/test';
import { SUPER_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Branding and shell-direction regression.
 *
 * The shell is a CSS grid whose first column is the sidebar. Grid columns
 * follow the inline axis, so an RTL document renders that first column on the
 * right *without* any direction override. An earlier `[data-dir='rtl']
 * .oryx-shell` rule swapped the template as well, which cancelled the RTL
 * behaviour out and left the sidebar on the left in Arabic — the exact
 * opposite of the requirement. These assertions pin the intended geometry so
 * that regression cannot return.
 *
 * They also pin the official brand lockup: the owner-supplied artwork must be
 * present (not the old monogram placeholder) and the correct colourway must be
 * visible in each theme.
 */
test.describe('branding and direction', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await page.setViewportSize({ width: 1536, height: 1024 });
  });

  test('Arabic is RTL with the sidebar on the right', async ({ page }) => {
    await setTheme(page, 'dark');
    await setLocale(page, 'ar');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('data-dir', 'rtl');

    const sidebar = await page.locator('.oryx-sidebar').boundingBox();
    const viewport = page.viewportSize();
    expect(sidebar).not.toBeNull();
    expect(viewport).not.toBeNull();

    // The sidebar must occupy the right-hand edge of the shell.
    expect(sidebar!.x + sidebar!.width).toBeGreaterThan(viewport!.width - 4);
    expect(sidebar!.x).toBeGreaterThan(viewport!.width / 2);

    // The header must not overlap it.
    const header = await page.locator('.oryx-header').boundingBox();
    expect(header!.x).toBeLessThan(sidebar!.x);
  });

  test('English is LTR with the sidebar on the left', async ({ page }) => {
    await setTheme(page, 'dark');
    await setLocale(page, 'en');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('data-dir', 'ltr');

    const sidebar = await page.locator('.oryx-sidebar').boundingBox();
    expect(sidebar!.x).toBeLessThan(4);

    const header = await page.locator('.oryx-header').boundingBox();
    expect(header!.x).toBeGreaterThanOrEqual(sidebar!.width - 4);
  });

  test('navigation labels are Arabic in RTL and English in LTR', async ({ page }) => {
    await setTheme(page, 'dark');

    await setLocale(page, 'ar');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const arabic = await page.locator('.oryx-nav-item').first().innerText();
    expect(arabic).toMatch(/[\u0600-\u06FF]/);

    await setLocale(page, 'en');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const english = await page.locator('.oryx-nav-item').first().innerText();
    expect(english).not.toMatch(/[\u0600-\u06FF]/);
  });

  test('the official brand lockup is used and swaps colourway by theme', async ({ page }) => {
    await setLocale(page, 'ar');
    await setTheme(page, 'dark');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Scope to the sidebar lockup: the dashboard hero carries a second
    // BrandLogo, so an unscoped `.oryx-brand-logo` matches two elements.
    const shell = page.locator('.oryx-sidebar');
    const logo = shell.locator('.oryx-brand-logo');
    await expect(logo).toBeVisible();

    const onDark = shell.locator('.oryx-brand-logo__on-dark');
    const onLight = shell.locator('.oryx-brand-logo__on-light');

    await expect(onDark).toBeVisible();
    await expect(onLight).toBeHidden();

    // The raster must actually load, not fall back to an empty box.
    const natural = await onDark.evaluate((el) => {
      const img = el as HTMLImageElement;
      return { w: img.naturalWidth, h: img.naturalHeight };
    });
    expect(natural.w).toBeGreaterThan(100);
    expect(natural.h).toBeGreaterThan(0);

    await setTheme(page, 'light');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(onLight).toBeVisible();
    await expect(onDark).toBeHidden();
  });

  test('the approved design reference is never used as dashboard artwork', async ({ page }) => {
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // The banner must be the purpose-drawn vector, not a crop of the approved
    // design reference. `hero-automotive.jpg` is a crop of
    // docs/assets/ORYX Auto Services Dashboard.png and must not appear here.
    const heroMedia = await page
      .locator('.oryx-hero__media')
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(heroMedia).toContain('banner-automotive.svg');
    expect(heroMedia).not.toContain('hero-automotive');

    // No element on the dashboard may reference the reference crop.
    const offenders = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*')).flatMap((el) => {
        const bg = getComputedStyle(el).backgroundImage;
        const src = el instanceof HTMLImageElement ? el.getAttribute('src') ?? '' : '';
        return bg.includes('hero-automotive') || src.includes('hero-automotive')
          ? [el.className || el.tagName]
          : [];
      }),
    );
    expect(offenders).toEqual([]);

    // The dashboard module tile must resolve to real, non-empty artwork.
    const tileUrl = await page
      .getByTestId('tile-dashboard')
      .locator('.oryx-tile__media')
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(tileUrl).toContain('tile-dashboard');

    const decoded = await page.evaluate(
      (url) =>
        new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error(`failed to load ${url}`));
          img.src = url;
        }),
      tileUrl.match(/url\("?(.*?)"?\)/)?.[1] ?? '',
    );
    expect(decoded.w).toBeGreaterThan(100);
    expect(decoded.h).toBeGreaterThan(0);
  });
});
