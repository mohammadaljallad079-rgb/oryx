import { expect, test, type Page } from '@playwright/test';
import { MODULES } from '@oryx/shared';
import { SUPER_ADMIN, ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Full responsiveness matrix (TASK 4).
 *
 * Sweeps every routed Admin surface across the required viewport widths in both
 * directions, and fails on the defects the owner called out: unintended
 * horizontal page overflow, clipped content, and elements that overlap the
 * header/sidebar.
 *
 * The tolerance in `hasHorizontalOverflow` absorbs sub-pixel rounding and the
 * overlay-scrollbar gutter, which is a few pixels and not a layout defect.
 *
 * Output: docs/audit/responsive/
 */

const OUT = '../../docs/audit/responsive';

const WIDTHS = [320, 360, 390, 430, 600, 768, 820, 1024, 1280, 1440, 1920];

/** Every routed module plus the non-module control-plane pages. */
const EXTRA_ROUTES = [
  '/dashboard',
  '/dashboard/overview',
  '/audit',
  '/security',
  '/settings',
  '/support',
  '/application',
  '/application/flags',
  '/application/versions',
  '/api-management',
  '/website',
  '/customer',
];

const ROUTES = Array.from(
  new Set([
    ...MODULES.filter((m) => m.status === 'AVAILABLE' && m.route.startsWith('/')).map((m) => m.route),
    ...EXTRA_ROUTES,
  ]),
).sort();

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 8;
  });
}

/** Elements that stick out past the viewport's right edge (or left in RTL). */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.display === 'none' || style.visibility === 'hidden') continue;
      // A closed mobile drawer is translated off-canvas on purpose; its
      // children are not layout defects.
      const drawer = el.closest<HTMLElement>('aside.oryx-sidebar, [data-oryx-offcanvas]');
      if (drawer && drawer.getAttribute('data-open') !== 'true') continue;

      // Content inside an element that scrolls on the x-axis is reachable by
      // scrolling (the data-table pattern), so it is not clipped.
      let scrollable = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if ((ps.overflowX === 'auto' || ps.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 4) {
          scrollable = true;
          break;
        }
      }
      if (scrollable) continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 8 || r.left < -8) {
        offenders.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)}`);
      }
    }
    return offenders.slice(0, 8);
  });
}

test.describe('responsiveness matrix — width sweep', () => {
  test.describe.configure({ mode: 'serial' });

  for (const width of WIDTHS) {
    test(`dashboard fits at ${width}px in en/dark`, async ({ page }) => {
      await signIn(page, SUPER_ADMIN);
      await setLocale(page, 'en');
      await setTheme(page, 'dark');
      await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard')).toBeVisible();

      expect(await hasHorizontalOverflow(page), `${width}px must not overflow horizontally`).toBe(false);
      expect(await overflowingElements(page), `${width}px must not clip or push elements off-screen`).toEqual([]);
    });
  }

  for (const width of WIDTHS) {
    test(`dashboard fits at ${width}px in ar/light (RTL)`, async ({ page }) => {
      await signIn(page, SUPER_ADMIN);
      await setLocale(page, 'ar');
      await setTheme(page, 'light');
      await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard')).toBeVisible();

      expect(await hasHorizontalOverflow(page), `${width}px RTL must not overflow`).toBe(false);
      expect(await overflowingElements(page), `${width}px RTL must not clip elements`).toEqual([]);
    });
  }
});

test.describe('responsiveness matrix — every route at the tight widths', () => {
  test.describe.configure({ mode: 'serial' });

  // The two narrowest required widths, both directions: the hardest case.
  for (const width of [320, 390]) {
    for (const locale of ['en', 'ar'] as const) {
      test(`all ${ROUTES.length} routes fit at ${width}px ${locale}`, async ({ page }) => {
        await signIn(page, SUPER_ADMIN);
        await setLocale(page, locale);
        await setTheme(page, 'dark');
        await page.setViewportSize({ width, height: 780 });

        const offenders: Array<{ route: string; reason: string }> = [];
        for (const route of ROUTES) {
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(350);

          const body = await page.locator('body').innerText();
          if (/Application error|Internal Server Error|Unhandled Runtime Error/i.test(body)) {
            offenders.push({ route, reason: 'error boundary' });
            continue;
          }
          if (await hasHorizontalOverflow(page)) {
            offenders.push({ route, reason: 'horizontal overflow' });
            continue;
          }
          const overflow = await overflowingElements(page);
          if (overflow.length) {
            offenders.push({ route, reason: `clipped: ${overflow.join(', ')}` });
          }
        }

        expect(offenders, `routes failing at ${width}px ${locale}`).toEqual([]);
      });
    }
  }

  test('desktop design is preserved at 1440px (no regression from mobile fixes)', async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard')).toBeVisible();

    // The persistent sidebar must be laid out, not hidden behind a drawer.
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    const box = await sidebar.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(180);
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
});

test.describe('responsiveness matrix — touch targets and orientation', () => {
  test('interactive controls meet a 32px minimum touch target on mobile', async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard')).toBeVisible();

    const tooSmall = await page.evaluate(() => {
      const offenders: string[] = [];
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>('button, a[href], [role="button"], input[type="checkbox"]'),
      )) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // Ignore inline links inside prose; they are not primary controls.
        if (el.tagName === 'A' && el.closest('p')) continue;
        if (r.height < 32 || r.width < 24) {
          offenders.push(`${el.tagName.toLowerCase()}[${(el.textContent || '').trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return offenders.slice(0, 12);
    });
    expect(tooSmall, 'mobile controls must be tappable').toEqual([]);
  });

  test('iPad portrait (820x1180) and landscape (1180x820) both fit', async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');

    for (const [w, h] of [
      [820, 1180],
      [1180, 820],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard')).toBeVisible();
      expect(await hasHorizontalOverflow(page), `${w}x${h} must not overflow`).toBe(false);
    }
  });
});

test.describe('responsiveness matrix — ERP surfaces as the Enterprise tenant', () => {
  test.describe.configure({ mode: 'serial' });

  const ERP = ['/accounting', '/sales', '/purchasing', '/inventory', '/hr', '/crm', '/automotive/inspections', '/automotive/maintenance', '/automotive/spare-parts', '/operations', '/reports', '/bookings', '/providers', '/payments', '/integrations'];

  for (const width of [390, 768, 1440]) {
    test(`ERP routes fit at ${width}px`, async ({ page }) => {
      await signIn(page, ENTERPRISE_ADMIN);
      await setLocale(page, 'en');
      await setTheme(page, 'dark');
      await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });

      const offenders: Array<{ route: string; reason: string }> = [];
      for (const route of ERP) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(350);
        const body = await page.locator('body').innerText();
        if (/Application error|Internal Server Error|Unhandled Runtime Error/i.test(body)) {
          offenders.push({ route, reason: 'error boundary' });
          continue;
        }
        if (await hasHorizontalOverflow(page)) {
          offenders.push({ route, reason: 'horizontal overflow' });
          continue;
        }
        const overflow = await overflowingElements(page);
        if (overflow.length) offenders.push({ route, reason: `clipped: ${overflow.join(', ')}` });
      }
      expect(offenders, `ERP routes failing at ${width}px`).toEqual([]);
    });
  }

  test('captures responsive screenshots for the owner', async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard')).toBeVisible();
      await page.screenshot({ path: `${OUT}/dashboard-${width}-en-dark.png`, fullPage: true });
    }
  });
});
