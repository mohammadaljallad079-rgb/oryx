import { expect, test } from '@playwright/test';
import { COMPANY_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Phase 1 regression — the dark/light theme contract.
 *
 * 1. Switching the theme flips `html[data-theme]` (the one switch the CSS keys
 *    off).
 * 2. No large element keeps a dark background in the light theme. The defect
 *    this guards against is a literal colour left in a rule, which no token
 *    audit can catch because it never mentions a token.
 * 3. The module-tile information band tracks the theme while the artwork above
 *    it stays put — the approved reference keeps a fixed photograph with a
 *    themed card bottom.
 *
 * The sidebar, the hero banner and the photo tiles are dark in both themes by
 * design, and a primary button is legitimately a navy fill on the ivory page;
 * these are exempted explicitly rather than by loosening the threshold.
 */
const THEMED_PAGES = ['/dashboard', '/accounting', '/sales', '/purchasing', '/hr', '/settings'];
const DARK_IN_BOTH =
  '.oryx-hero, .oryx-sidebar, .oryx-tile, button, a.oryx-btn, .oryx-btn, .oryx-badge, [data-allow-dark]';

test.describe('theme system', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
  });

  test('toggle flips html[data-theme]', async ({ page }) => {
    await setTheme(page, 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await setTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('no dark surface survives the light theme', async ({ page }) => {
    await setTheme(page, 'light');
    for (const path of THEMED_PAGES) {
      await page.goto(path);
      await page.waitForTimeout(500);
      const offenders = await page.evaluate((exempt) => {
        function alpha(rgb: string): number {
          const m = rgb.match(/rgba?\(([^)]+)\)/);
          return m ? parseFloat(m[1].split(',')[3] ?? '1') : 1;
        }
        function luminance(rgb: string): number {
          const m = rgb.match(/rgba?\(([^)]+)\)/);
          if (!m) return 255;
          const [r, g, b] = m[1].split(',').map((v) => parseFloat(v.trim()));
          return 0.299 * r + 0.587 * g + 0.114 * b;
        }
        const found: string[] = [];
        document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
          const bg = getComputedStyle(el).backgroundColor;
          if (alpha(bg) < 0.6 || luminance(bg) > 90) return;
          if (el.closest(exempt)) return;
          const rect = el.getBoundingClientRect();
          if (rect.width * rect.height < 900) return;
          found.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 60)} ${bg}`);
        });
        return found;
      }, DARK_IN_BOTH);
      expect(offenders, `dark surfaces in light theme on ${path}`).toEqual([]);
    }
  });

  test('module-tile band tracks the theme, artwork does not', async ({ page }) => {
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      await page.goto('/dashboard');
      const tile = page.locator('[data-testid="tile-financial_accounting"]');
      await tile.waitFor();
      await page.waitForTimeout(300);
      const info = await tile.evaluate((el) => {
        const title = el.querySelector('.oryx-tile__title');
        return {
          band: getComputedStyle(el, '::after').backgroundImage,
          artwork: getComputedStyle(el.querySelector('.oryx-tile__media')!).backgroundImage,
          ink: title ? getComputedStyle(title).color : '',
        };
      });
      // The artwork is the approved photograph and is identical in both themes.
      expect(info.artwork, 'tile artwork must not change with the theme').toContain('url(');
      if (theme === 'dark') {
        expect(info.band, 'dark band stays on the full-cover scrim').toBe('none');
        expect(info.ink).toBe('rgb(255, 255, 255)');
      } else {
        expect(info.band, 'light band paints an ivory fade').toContain('247, 244, 237');
        expect(info.ink, 'light band uses dark ink').toBe('rgb(26, 23, 18)');
      }
    }
  });
});
