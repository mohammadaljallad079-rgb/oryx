import { expect, test, type Page } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 19 — booking date picker evidence.
 *
 * Captures the automotive inspection booking date field in both directions and
 * both themes, and opens the native calendar to show the enlarged indicator.
 * Output lands under `.run/evidence/exec19/datepicker/` so the preview host
 * serves it at `/evidence/exec19/datepicker/`.
 */
const OUT = '../../.run/evidence/exec19/datepicker';

async function openBooking(page: Page): Promise<void> {
  await page.goto('/automotive/inspections');
  await expect(page.getByTestId('inspections-page')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('inspections-tab-bookings').click();
  await page.getByTestId('new-inspection-booking').click();
  await expect(page.getByTestId('booking-date')).toBeVisible();
}

test.describe('Execution 19 — booking date picker', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const locale of ['en', 'ar'] as const) {
      test(`booking date field — ${locale} / ${theme}`, async ({ page }) => {
        await signIn(page, ENTERPRISE_ADMIN);
        await setLocale(page, locale);
        await setTheme(page, theme);
        await openBooking(page);

        const field = page.getByTestId('booking-date');
        await field.scrollIntoViewIfNeeded();

        // Chrome does not resolve `getComputedStyle(el, '::-webkit-calendar-picker-indicator')`
        // in this build (it returns the field's own style), so the enlarged
        // indicator is evidenced behaviourally in the popup test below rather
        // than by reading the pseudo-element box here.
        const metrics = await field.evaluate((el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            width: Math.round(r.width),
            height: Math.round(r.height),
            minHeight: cs.minHeight,
            paddingInlineEnd: cs.paddingInlineEnd,
            colorScheme: cs.colorScheme,
            hasDateClass: el.classList.contains('oryx-input--date'),
          };
        });
        console.log(`[date-picker] ${locale}/${theme}`, JSON.stringify(metrics));

        await field.screenshot({ path: `${OUT}/field-${locale}-${theme}.png` });
        await page.screenshot({ path: `${OUT}/modal-${locale}-${theme}.png` });
      });
    }
  }

  test('calendar popup opens in Chrome (en / light)', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'light');
    await openBooking(page);

    const field = page.getByTestId('booking-date');
    await field.scrollIntoViewIfNeeded();
    await expect(field).toHaveClass(/oryx-input--date/);

    const before = (await page.screenshot()).toString('base64');
    const box = await field.boundingBox();
    expect(box).not.toBeNull();

    // Click the enlarged indicator at the trailing edge of the field.
    await page.mouse.click(box!.x + box!.width - 12, box!.y + box!.height / 2);
    await page.waitForTimeout(700);
    const after = (await page.screenshot({ path: `${OUT}/popup-click.png` })).toString('base64');

    // The calendar must have painted: the two frames differ over a large area.
    const diff = await countChangedPixels(page, before, after);
    console.log(`[date-picker] popup changed pixels: ${diff}`);
    expect(diff).toBeGreaterThan(2000);

    // The native picker API must also be callable from the field.
    const opened = await field.evaluate((el) => {
      try {
        (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
        return true;
      } catch {
        return false;
      }
    });
    expect(opened).toBe(true);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/popup-showpicker.png` });

    // The field must stay editable after the picker interaction.
    await field.fill('2026-12-31T10:30');
    await expect(field).toHaveValue('2026-12-31T10:30');
  });
});

/** Counts meaningfully-changed pixels between two PNG frames, in the browser. */
async function countChangedPixels(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(
    async ([pa, pb]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${src}`;
        });
      const [ia, ib] = await Promise.all([load(pa), load(pb)]);
      const read = (img: HTMLImageElement) => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d')!.drawImage(img, 0, 0);
        return c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      };
      const da = read(ia);
      const db = read(ib);
      let changed = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d =
          Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (d > 30) changed++;
      }
      return changed;
    },
    [a, b],
  );
}
