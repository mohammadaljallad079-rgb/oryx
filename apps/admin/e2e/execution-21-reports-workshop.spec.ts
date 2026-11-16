import { expect, test, type Page } from '@playwright/test';
import { ENTERPRISE_ADMIN, apiToken, pickOption, setLocale, signIn } from './helpers';

/**
 * Execution 21 — Reports workspace and the redesigned workshop.
 *
 * Two independent areas:
 *
 * - The Reports workspace resolves a catalogue from the API and every entry
 *   must open a real PDF (preview) and export a CSV. The preview renders the
 *   generated PDF in a modal iframe, so the assertion is that the dialog and
 *   its frame appear and no server error is raised.
 * - The workshop (car maintenance) screen must show its live dashboard, switch
 *   between its five tabs, and let an operator create a service bay. Creating a
 *   bay is the one workshop write that needs no pre-existing vehicle, so it is
 *   the round-trip this suite drives; the job-card lifecycle is exercised
 *   against the API in the same test so the enforced state machine is covered
 *   without depending on seeded workshop rows.
 *
 * The automotive modules are licensed to the Enterprise plan, so the suite signs
 * in as `ENTERPRISE_ADMIN` rather than the demo tenant.
 */

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

/** A token for the Enterprise tenant, used for the API-side assertions. */
async function token(page: Page): Promise<string> {
  return apiToken(page, ENTERPRISE_ADMIN);
}

test.describe('Execution 21 — reports workspace', () => {
  test('1. the catalogue loads and every report resolves from live data', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await page.goto('/reports');
    await expect(page.getByTestId('reports-page')).toBeVisible();

    // The catalogue comes from the server; the page must render the tiles it
    // returns rather than a hard-coded list.
    await expect(page.getByTestId('report-list')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('report-tile-sales-summary')).toBeVisible();
    await expect(page.getByTestId('report-tile-trial-balance')).toBeVisible();

    // The detail panel resolves the selected report and shows its row count.
    await page.getByTestId('report-tile-sales-summary').click();
    await expect(page.getByTestId('report-detail')).toBeVisible();
    await expect(page.getByTestId('report-row-count')).toBeVisible({ timeout: 20_000 });
  });

  test('2. a report opens a real PDF preview', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await page.goto('/reports');
    await expect(page.getByTestId('report-list')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('report-tile-sales-summary').click();
    await page.getByTestId('report-preview').click();

    // The preview is a modal holding the generated PDF in a frame.
    await expect(page.locator('.oryx-modal')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId('report-preview-body')).toBeVisible();
    await expect(page.getByTestId('report-preview-body').locator('iframe')).toHaveCount(1, { timeout: 20_000 });

    await page.getByRole('button', { name: /close/i }).first().click();
    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 15_000 });
  });

  test('3. every catalogue report produces a PDF and a CSV over the API', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    const t = await token(page);

    const result = await page.evaluate(
      async ({ api, t }) => {
        const headers = { Authorization: `Bearer ${t}` };
        const catalogue = (await (await fetch(`${api}/reports/catalogue`, { headers })).json()) as {
          reports: Array<{ kind: string }>;
        };
        const out: Array<{ kind: string; pdf: number; pdfMagic: boolean; csv: number }> = [];
        for (const r of catalogue.reports) {
          const pdfRes = await fetch(`${api}/reports/${r.kind}/pdf`, { headers });
          const pdfBuf = await pdfRes.arrayBuffer();
          const pdfMagic = new Uint8Array(pdfBuf).slice(0, 5).every((b, i) => b === '%PDF-'.charCodeAt(i));
          const csvRes = await fetch(`${api}/reports/${r.kind}/export`, { headers });
          out.push({ kind: r.kind, pdf: pdfRes.status, pdfMagic, csv: csvRes.status });
        }
        return { count: catalogue.reports.length, out };
      },
      { api: API, t },
    );

    expect(result.count).toBeGreaterThan(0);
    for (const row of result.out) {
      expect(row.pdf, `${row.kind} PDF`).toBe(200);
      expect(row.pdfMagic, `${row.kind} PDF magic`).toBe(true);
      expect(row.csv, `${row.kind} CSV`).toBe(200);
    }
  });
});

test.describe('Execution 21 — workshop redesign', () => {
  test('4. the workshop dashboard shows live counts and the tabs switch', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await page.goto('/automotive/maintenance');
    await expect(page.getByTestId('maintenance-page')).toBeVisible();

    // The dashboard resolves before the tiles paint; the bays tile is always
    // present because a tenant can have zero bays and still render the row.
    await expect(page.getByTestId('workshop-dashboard')).toBeVisible();
    await expect(page.getByTestId('ws-kpi-bays')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('ws-kpi-open')).toBeVisible();

    await page.getByTestId('maintenance-tab-bay').click();
    await expect(page.getByTestId('new-bay')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('maintenance-tab-warranties').click();
    await expect(page.getByTestId('maintenance-tab-warranties')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('maintenance-tab-job-cards').click();
    await expect(page.getByTestId('new-job-card')).toBeVisible({ timeout: 20_000 });
  });

  test('5. a service bay can be created and appears in the list', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await page.goto('/automotive/maintenance');
    await expect(page.getByTestId('maintenance-page')).toBeVisible();
    await page.getByTestId('maintenance-tab-bay').click();
    await expect(page.getByTestId('new-bay')).toBeVisible({ timeout: 20_000 });

    // A unique code keeps the test re-runnable; a conflict would fail the save.
    const code = `E21-${Date.now().toString().slice(-6)}`;
    await page.getByTestId('new-bay').click();
    await expect(page.getByTestId('bay-code')).toBeVisible();
    await page.getByTestId('bay-code').fill(code);
    await page.getByTestId('bay-name-en').fill('E2E Bay');
    await page.getByTestId('bay-name-ar').fill('ورشة اختبار');
    await page.getByTestId('save-bay').click();

    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId(`bay-row-${code}`)).toBeVisible({ timeout: 20_000 });
  });

  test('6. a job card moves through the enforced workshop state machine', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    const t = await token(page);

    const outcome = await page.evaluate(
      async ({ api, t }) => {
        const headers = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
        const vehicles = (await (await fetch(`${api}/automotive/vehicles?pageSize=1`, { headers })).json()) as {
          items: Array<{ id: string }>;
        };
        if (vehicles.items.length === 0) return { skipped: true } as const;
        const vehicleId = vehicles.items[0].id;

        const created = await fetch(`${api}/automotive/job-cards`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ vehicleId, complaint: 'E2E workshop lifecycle' }),
        });
        if (!created.ok) throw new Error(`create job card ${created.status} ${await created.text()}`);
        const job = (await created.json()) as { id: string; status: string };

        // An estimate is required before completion; approve it first.
        const estimateRes = await fetch(`${api}/automotive/job-cards/${job.id}/estimates`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            lines: [{ type: 'LABOUR', description: 'E2E labour', quantity: 10000, unitPriceMinor: 25000, taxPercentBp: 1000 }],
          }),
        });
        const estimate = (await estimateRes.json()) as { id: string; subtotalMinor: number; taxMinor: number; totalMinor: number };
        await fetch(`${api}/automotive/estimates/${estimate.id}/approve`, { method: 'POST', headers, body: '{}' });

        const patch = async (status: string) => {
          const res = await fetch(`${api}/automotive/job-cards/${job.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status }),
          });
          return { status: res.status, body: (await res.json()) as { status?: string } };
        };

        const toApproval = await patch('AWAITING_APPROVAL');
        const toApproved = await patch('APPROVED');
        const toProgress = await patch('IN_PROGRESS');
        const toCompleted = await patch('COMPLETED');
        // An illegal jump (COMPLETED -> OPEN) must be refused by the server.
        const illegal = await patch('OPEN');

        return {
          skipped: false,
          estimate,
          estimateMath: estimate.subtotalMinor + estimate.taxMinor === estimate.totalMinor,
          transitions: [toApproval.status, toApproved.status, toProgress.status, toCompleted.status],
          completedStatus: toCompleted.body.status,
          illegalStatus: illegal.status,
        } as const;
      },
      { api: API, t },
    );

    if (outcome.skipped) {
      test.skip(true, 'No vehicle seeded for the Enterprise tenant.');
      return;
    }
    expect(outcome.estimateMath).toBe(true);
    expect(outcome.transitions).toEqual([200, 200, 200, 200]);
    expect(outcome.completedStatus).toBe('COMPLETED');
    // The state machine is server-side: an illegal transition is a 4xx.
    expect(outcome.illegalStatus).toBeGreaterThanOrEqual(400);
  });

  test('7. the workshop screen renders Arabic RTL', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'ar');
    await page.goto('/automotive/maintenance');
    await expect(page.getByTestId('maintenance-page')).toBeVisible();
    await expect(page.getByTestId('workshop-dashboard')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('8. the new job card form offers the vehicle and bay pickers', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await page.goto('/automotive/maintenance');
    await expect(page.getByTestId('new-job-card')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('new-job-card').click();

    await expect(page.getByTestId('job-vehicle')).toBeVisible();
    await expect(page.getByTestId('job-bay')).toBeVisible();
    await expect(page.getByTestId('job-complaint')).toBeVisible();

    // The vehicle picker is the searchable catalogue control; picking one fills
    // the selection without leaving the dialog.
    await pickOption(page, 'job-vehicle', { index: 0 });
    await page.keyboard.press('Escape');
    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 15_000 });
  });

  test('9. the job card register filters by search and names the customer and technician', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await page.goto('/automotive/maintenance');
    await expect(page.getByTestId('maintenance-page')).toBeVisible();
    await page.getByTestId('maintenance-tab-job-cards').click();

    // The register exposes a free-text filter over the job number, complaint
    // and the vehicle's VIN/plate.
    const search = page.getByTestId('job-search-filter');
    await expect(search).toBeVisible({ timeout: 20_000 });

    // A filter that cannot match anything must empty the register rather than
    // silently keep the full list.
    await search.fill('no-such-job-zzz-999');
    await expect
      .poll(async () => page.locator('[data-testid^="job-row-"]').count(), { timeout: 20_000 })
      .toBe(0);

    // Clearing the filter restores the list and removes the clear control.
    await page.getByTestId('job-clear-filters').click();
    await expect(search).toHaveValue('');
    await expect(page.getByTestId('job-clear-filters')).toHaveCount(0);

    // Every rendered row carries the customer and technician columns that the
    // API decorates, so the register is readable without opening a detail view.
    const rows = page.locator('[data-testid^="job-row-"]');
    if ((await rows.count()) > 0) {
      const firstRow = rows.first();
      const headers = (await page.locator('table thead th').allInnerTexts()).join(' ').toUpperCase();
      expect(headers).toContain('CUSTOMER');
      expect(headers).toContain('TECHNICIAN');
      await expect(firstRow.locator('td')).toHaveCount(8);
    }
  });
});
