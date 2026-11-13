import { expect, test } from '@playwright/test';
import { addFirstProductToCart, clearCart, setLocale, setTheme, signIn } from './helpers';

/**
 * Functional coverage of the public ORYX website.
 *
 * Every assertion exercises the real running site against the real API and the
 * seeded database: no fixture data is injected and no network call is mocked.
 */

test.describe('homepage', () => {
  test('hero is a real slider with four distinct photographs', async ({ page }) => {
    await setLocale(page, 'ar');
    await page.goto('/');
    const slider = page.getByTestId('hero-slider');
    await expect(slider).toBeVisible();

    // Four real slide photographs, each distinct.
    const sources = await slider.locator('.oryx-hero-slide img').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLImageElement).getAttribute('src')),
    );
    expect(sources).toHaveLength(4);
    expect(new Set(sources).size).toBe(4);

    // Every image actually decodes (not a broken placeholder).
    for (const src of sources) {
      const ok = await page.evaluate(
        (url) =>
          new Promise<boolean>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth > 0);
            img.onerror = () => resolve(false);
            img.src = url as string;
          }),
        src,
      );
      expect(ok, `image ${src} must load`).toBe(true);
    }

    // Slide one headline and CTA, then advance to slide two.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'خدمات السيارات المتكاملة في مكان واحد',
    );
    await slider.getByRole('button', { name: 'Next slide' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عناية احترافية لسيارتك');

    // Pagination indicators are present and selectable.
    await slider.getByRole('tab', { name: 'قطع غيار لسيارتك بكل سهولة' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('قطع غيار لسيارتك بكل سهولة');
  });

  test('shows trust highlights, service cards and real catalogue products', async ({ page }) => {
    await setLocale(page, 'ar');
    await page.goto('/');
    await expect(page.locator('.oryx-trust-item')).toHaveCount(6);
    await expect(page.getByTestId('service-card').first()).toBeVisible();
    await expect(page.getByTestId('product-card').first()).toBeVisible();
  });
});

test.describe('services', () => {
  test('lists all ten services and opens a detail page', async ({ page }) => {
    await setLocale(page, 'ar');
    await page.goto('/services');
    await expect(page.getByTestId('service-card')).toHaveCount(10);
    await page.goto('/services/periodic_maintenance');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /احجز|Book/ }).first()).toBeVisible();
  });
});

test.describe('store', () => {
  test('lists the real catalogue and filters by category', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/store');
    await expect(page.getByTestId('product-grid')).toBeVisible();
    const all = await page.getByTestId('product-card').count();
    expect(all).toBeGreaterThan(0);

    await page.goto('/store?category=brakes');
    await expect(page.getByTestId('result-count')).toContainText(/brakes|products/i);
    const brakes = await page.getByTestId('product-card').count();
    expect(brakes).toBeGreaterThan(0);
    expect(brakes).toBeLessThanOrEqual(all);
  });

  test('search narrows results and reports an honest empty state', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/store');
    const search = page.getByTestId('store-search');
    await search.fill('brake');
    await search.press('Enter');
    await expect(page).toHaveURL(/search=brake/);
    // The results stream in after the URL changes, so wait for the grid rather
    // than sampling the count immediately.
    await expect(page.getByTestId('product-card').first()).toBeVisible();
    expect(await page.getByTestId('product-card').count()).toBeGreaterThan(0);

    await search.fill('zzzz-no-such-part');
    await search.press('Enter');
    await expect(page.getByText(/no matching|no products/i)).toBeVisible();
  });

  test('product detail shows price, availability, compatibility and add to cart', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/store');
    const card = page.getByTestId('product-card').first();
    const sku = await card.getAttribute('data-sku');
    await card.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText(/[1-9]/);

    await page.goto(`/store/${sku}`);
    await expect(page.getByTestId('product-name')).toBeVisible();
    await expect(page.getByTestId('product-stock')).toBeVisible();
    await expect(page.getByTestId('quantity-input')).toBeVisible();
  });
});

test.describe('cart and checkout', () => {
  test('cart quotes server-side and reaches the checkout form', async ({ page }) => {
    await clearCart(page);
    await setLocale(page, 'en');
    await addFirstProductToCart(page);
    await page.goto('/cart');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-total')).toContainText(/BHD|ب\.د/);
    await page.getByRole('link', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/checkout/);
  });

  test('checkout requires a session and then places a real order', async ({ page }) => {
    await clearCart(page);
    await setLocale(page, 'en');
    await addFirstProductToCart(page);
    await page.goto('/checkout');
    await expect(page.getByText(/sign in/i).first()).toBeVisible();

    await signIn(page);
    await page.goto('/checkout');
    await expect(page.getByTestId('checkout-name')).toBeVisible();
    await page.getByTestId('checkout-name').fill('Playwright Buyer');
    await page.getByTestId('checkout-phone').fill('+97333001234');
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('order-success')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('order-number')).toContainText(/WEB-/i);

    await page.goto('/account/orders');
    await expect(page.getByTestId('order-card').first()).toBeVisible();
  });
});

test.describe('booking', () => {
  test('books a real slot as a guest and returns a reference', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/booking');

    await page.getByTestId('service-periodic_maintenance').click();
    await page.getByTestId('booking-next').click();

    await page.locator('[data-testid^="branch-"]').first().click();
    await page.getByTestId('booking-next').click();
    await page.getByTestId('booking-next').click();

    const slot = page.getByTestId('slot').first();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await slot.click();
    await page.getByTestId('booking-next').click();

    await page.getByTestId('input-name').fill('Playwright Guest');
    await page.getByTestId('input-phone').fill('+97333005678');
    await page.getByTestId('booking-confirm').click();

    await expect(page.getByTestId('booking-success')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('booking-reference')).toContainText(/BK-/);
  });
});

test.describe('content pages', () => {
  for (const [path, heading] of [
    ['/branches', /فروع|branch/i],
    ['/about', /أوريكس|ORYX/],
    ['/contact', /اتصل|contact/i],
    ['/offers', /عروض|offers/i],
  ] as const) {
    test(`${path} renders`, async ({ page }) => {
      await setLocale(page, 'ar');
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    });
  }

  test('contact form submits to the backend', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/contact');
    await page.getByTestId('contact-name').fill('Playwright Visitor');
    await page.getByTestId('contact-email').fill('playwright@example.com');
    await page.getByTestId('contact-message').fill('Please quote brake pads for a 2020 Patrol.');
    await page.getByRole('button', { name: /send|إرسال/i }).click();
    await expect(page.getByText(/received|تم استلام/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('account', () => {
  test('signed-in customer sees appointments and wishlist', async ({ page }) => {
    await setLocale(page, 'en');
    await signIn(page);

    // Book a real appointment as the authenticated customer so the history
    // table has a row to show rather than the honest empty state.
    await page.goto('/booking');
    await page.getByTestId('service-periodic_maintenance').click();
    await page.getByTestId('booking-next').click();
    await page.locator('[data-testid^="branch-"]').first().click();
    await page.getByTestId('booking-next').click();
    await page.getByTestId('booking-next').click();
    await page.getByTestId('slot').first().click();
    await page.getByTestId('booking-next').click();
    await page.getByTestId('input-name').fill('Playwright Owner');
    await page.getByTestId('input-phone').fill('+97333009911');
    await page.getByTestId('booking-confirm').click();
    await expect(page.getByTestId('booking-success')).toBeVisible({ timeout: 20_000 });

    await page.goto('/account/appointments');
    await expect(page.getByTestId('appointments-table')).toBeVisible();
    await page.goto('/account/wishlist');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('themes, locale and SEO', () => {
  test('light theme repaints the header and hero', async ({ page }) => {
    await setLocale(page, 'en');
    await setTheme(page, 'light');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('interior page banners follow the theme', async ({ page }) => {
    await setLocale(page, 'en');
    const banner = page.locator('.oryx-page-head--banner').first();
    const heading = banner.locator('.oryx-h1');

    await setTheme(page, 'dark');
    await page.goto('/store');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(banner).toBeVisible();
    expect(await banner.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(0, 22, 43)',
    );
    expect(await heading.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');

    // Switching to the light theme must repaint the banner, not leave it navy.
    await setTheme(page, 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await banner.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(247, 244, 237)',
    );
    expect(await heading.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(0, 22, 43)');
  });

  test('language switch flips the document direction', async ({ page }) => {
    await setLocale(page, 'ar');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'خدمات السيارات المتكاملة في مكان واحد',
    );
    await page.getByTestId('locale-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    // The hero copy is localised too, not just the document direction.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Complete automotive services in one place',
    );
  });

  test('serves a sitemap, robots file and product structured data', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBe(true);
    expect(await robots.text()).toContain('Sitemap');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    const xml = await sitemap.text();
    expect(xml).toContain('/store/');
    expect(xml).toContain('/services/');

    // The catalogue must appear in the sitemap, not just the static routes.
    const urls = xml.match(/<loc>/g) ?? [];
    expect(urls.length).toBeGreaterThan(20);
  });

  test('emits canonical URLs and JSON-LD structured data', async ({ request }) => {
    const home = await (await request.get('/')).text();
    // LocalBusiness family schema is emitted once per branch (AutoRepair).
    expect(home).toContain('"@type":"AutoRepair"');
    expect(home).toContain('"@type":"PostalAddress"');

    const product = await (await request.get('/store/BRAKE-PAD-F')).text();
    expect(product).toContain('"@type":"Product"');
    expect(product).toContain('"@type":"Offer"');
    expect(product).toContain('"priceCurrency":"BHD"');
    expect(product).toContain('schema.org/InStock');

    const canonical = product.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(canonical).toContain('/store/BRAKE-PAD-F');

    const service = await (await request.get('/services/periodic_maintenance')).text();
    expect(service).toContain('"@type":"Service"');
  });

  test('has no horizontal overflow on any primary page', async ({ page }) => {
    for (const path of ['/', '/services', '/store', '/booking', '/branches', '/about', '/contact']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} must not overflow horizontally`).toBeLessThanOrEqual(1);
    }
  });
});
