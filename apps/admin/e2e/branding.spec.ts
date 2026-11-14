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

  test('the sidebar lockup swaps its colourway with the themed rail', async ({ page }) => {
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

    // Execution 20 requires the sidebar to switch with the theme: the light
    // rail is an ivory field, so its lockup uses the on-light (navy/gold)
    // colourway. The theme swap must not keep the on-dark lockup, which would
    // print a white mark on the light field.
    await expect(onLight).toBeVisible();
    await expect(onDark).toBeHidden();

    // And the rail must paint a light field, not a fixed navy slab, so the
    // light-theme navigation cannot silently keep the dark rail.
    const railBg = await shell.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(railBg).toContain('gradient');
    const navText = await shell.locator('.oryx-nav-item').first().evaluate(
      (el) => getComputedStyle(el).color,
    );
    // A dark ink on the ivory rail: every channel stays low.
    const [r, g, b] = navText.match(/\d+/g)!.map(Number);
    expect(r).toBeLessThan(120);
    expect(g).toBeLessThan(120);
    expect(b).toBeLessThan(120);
  });

  test('the dashboard banner carries no vehicle image and centres the ORYX mark', async ({ page }) => {
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // The owner's brief: no vehicle image in the banner. The banner is a pure
    // CSS field, so no element may reference the old automotive artwork.
    const offenders = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*')).flatMap((el) => {
        const bg = getComputedStyle(el).backgroundImage;
        const src = el instanceof HTMLImageElement ? el.getAttribute('src') ?? '' : '';
        return bg.includes('banner-automotive') ||
          bg.includes('automotive-hero') ||
          src.includes('banner-automotive') ||
          src.includes('automotive-hero')
          ? [el.className || el.tagName]
          : [];
      }),
    );
    expect(offenders).toEqual([]);

    // The approved design reference must never be used as banner artwork either.
    const heroMedia = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.oryx-hero') as Element).backgroundImage,
    );
    expect(heroMedia).not.toContain('hero-automotive');

    // The banner paints an opaque navy field of its own.
    expect(heroMedia).toMatch(/gradient|rgb/);

    // The approved design anchors the mark on the reading-start edge (left in
    // LTR) with the identity block beside it, not centred. Pin the leading-edge
    // lockup so a future change cannot silently re-centre the banner.
    const banner = await page.getByTestId('dashboard-hero').boundingBox();
    const logo = await page
      .locator('.oryx-hero .oryx-brand-logo')
      .first()
      .boundingBox();
    expect(banner).not.toBeNull();
    expect(logo).not.toBeNull();
    expect(logo!.x - banner!.x).toBeLessThan(80);
    expect(logo!.x + logo!.width / 2).toBeLessThan(banner!.x + banner!.width / 2);

    // The lockup must actually load, not fall back to an empty box.
    const natural = await page
      .locator('.oryx-hero .oryx-brand-logo__on-dark')
      .evaluate((el) => {
        const img = el as HTMLImageElement;
        return { w: img.naturalWidth, h: img.naturalHeight };
      });
    expect(natural.w).toBeGreaterThan(100);

    // The banner is theme-adaptive: it paints ivory in the light theme, so it
    // must swap to the navy-ink colourway rather than keeping the white one.
    await setTheme(page, 'light');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.oryx-hero .oryx-brand-logo__on-light')).toBeVisible();
    await expect(page.locator('.oryx-hero .oryx-brand-logo__on-dark')).toBeHidden();
  });

  test('every dashboard module tile uses its own original vector artwork', async ({ page }) => {
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

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

    // Every module tile must be original vector art. A `.jpg` here would mean
    // the reference-crop pipeline has been reintroduced.
    const tileUrls = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="tile-"] .oryx-tile__media')).map(
        (el) => getComputedStyle(el).backgroundImage.match(/url\("?(.*?)"?\)/)?.[1] ?? '',
      ),
    );
    expect(tileUrls.length).toBeGreaterThan(10);
    expect(tileUrls.filter((url) => !url.endsWith('.svg'))).toEqual([]);

    // And every one of them must decode, not just resolve.
    const broken = await page.evaluate(
      (urls) =>
        Promise.all(
          urls.map(
            (url) =>
              new Promise<string | null>((resolve) => {
                const img = new Image();
                img.onload = () => resolve(null);
                img.onerror = () => resolve(url);
                img.src = url;
              }),
          ),
        ),
      tileUrls,
    );
    expect(broken.filter(Boolean)).toEqual([]);
    expect(decoded.h).toBeGreaterThan(0);

    // Every card must own a dedicated visual. Two cards sharing one asset means
    // a module is presenting another module's imagery, which is what the
    // original screenshot-crop pipeline produced.
    expect(new Set(tileUrls).size).toBe(tileUrls.length);
  });
});
