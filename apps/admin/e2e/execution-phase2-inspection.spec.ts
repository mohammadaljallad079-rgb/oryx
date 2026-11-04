import { expect, test, type Page } from '@playwright/test';
import { ENTERPRISE_ADMIN, apiToken, expectNoServerError, setLocale, signIn } from './helpers';

/**
 * The interactive vehicle inspection workspace.
 *
 * These tests drive the real interface against the real API: a job is created
 * from the list page, opened, filled in on the section editors and pushed
 * through submit and approval. Nothing is stubbed, so a broken API contract or a
 * missing permission fails here rather than in production.
 */

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

/** The seeded vehicle that belongs to the first seeded customer. */
async function seedJob(page: Page, areas: string[]): Promise<string> {
  const token = await apiToken(page, ENTERPRISE_ADMIN);
  return page.evaluate(
    async ({ api, token, areas }) => {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const customers = (await (await fetch(`${api}/sales/customers?pageSize=5`, { headers })).json()) as {
        items: Array<{ id: string }>;
      };
      const customerId = customers.items[0].id;
      const vehicles = (await (
        await fetch(`${api}/automotive/vehicles?customerId=${customerId}`, { headers })
      ).json()) as { items: Array<{ id: string }> };
      const created = await fetch(`${api}/automotive/inspections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ customerId, vehicleId: vehicles.items[0].id, selectedAreas: areas }),
      });
      if (!created.ok) throw new Error(`Job creation failed: ${created.status} ${await created.text()}`);
      return ((await created.json()) as { id: string }).id;
    },
    { api: API, token, areas },
  );
}

test.describe('Execution Phase 2 — inspection workspace', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
  });

  test('creates a job from the list page and opens its workspace', async ({ page }) => {
    await page.goto('/automotive/inspections');
    await expect(page.getByTestId('inspections-page')).toBeVisible();
    await expect(page.getByTestId('inspection-jobs')).toBeVisible();

    await page.getByTestId('new-inspection-job').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(1);

    // Every selectable inspection type is offered, in English.
    await expect(page.getByTestId('job-types')).toBeVisible();
    await expect(page.getByTestId('job-type-PAINT_BODY')).toBeVisible();
    await expect(page.getByTestId('job-type-CHASSIS_UNDERCARRIAGE')).toBeVisible();
    await expect(page.getByTestId('job-type-COMPUTER_UNIT')).toBeVisible();

    await page.getByTestId('job-customer').selectOption({ index: 1 });
    await page.getByTestId('job-vehicle').selectOption({ index: 1 });
    await page.getByTestId('job-type-INTERIOR').click();
    await page.getByTestId('job-type-EXTERIOR').click();
    await page.getByTestId('create-inspection-job').click();

    await expect(page.locator('.oryx-modal')).toHaveCount(0);
    const row = page.locator('[data-testid^="job-row-"]').first();
    await expect(row).toBeVisible();
    const jobNumber = (await row.locator('td').first().innerText()).trim();
    expect(jobNumber).toMatch(/^JOB-/);

    await row.locator('[data-testid^="open-job-"]').click();
    await page.waitForURL('**/automotive/inspections/**');
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();
    await expectNoServerError(page);

    // The identity block carries the real vehicle, and the header names it.
    await expect(page.getByTestId('inspection-identity')).toContainText('JTMHV05J204123456');
    await expect(page.getByTestId('inspection-workspace')).toContainText('Toyota');

    // Only the two selected sections are on the rail.
    await expect(page.getByTestId('inspection-rail')).toBeVisible();
    await expect(page.getByTestId('inspection-rail-INTERIOR')).toBeVisible();
    await expect(page.getByTestId('inspection-rail-EXTERIOR')).toBeVisible();
    await expect(page.getByTestId('inspection-rail-ROAD_TEST')).toHaveCount(0);
    await expect(page.getByTestId('inspection-rail-COMPUTER_UNIT')).toHaveCount(0);
  });

  test('records a checklist section and reports its progress', async ({ page }) => {
    const id = await seedJob(page, ['EXTERIOR']);
    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();

    const checklist = page.getByTestId('checklist-EXTERIOR');
    await expect(checklist).toBeVisible();

    // The rail starts incomplete and the submit button is blocked.
    await expect(page.getByTestId('inspection-rail-EXTERIOR')).toHaveAttribute('data-complete', 'false');
    await expect(page.getByTestId('inspection-submit')).toBeDisabled();

    // Answer every item as passing.
    for (const key of [
      'exterior.windows',
      'exterior.lights',
      'exterior.indicators',
      'exterior.wipers',
      'exterior.mirrors',
      'exterior.tiresRims',
    ]) {
      await page.getByTestId(`item-${key}-PASS`).click();
    }
    await page.getByTestId('remarks-EXTERIOR').fill('Bodywork sound.');
    await page.getByTestId('save-section-EXTERIOR').click();

    // The rail and the submit button both react to the saved state.
    await expect(page.getByTestId('inspection-rail-EXTERIOR')).toHaveAttribute('data-complete', 'true');
    await expect(page.getByTestId('inspection-submit')).toBeEnabled();

    await page.getByTestId('inspection-submit').click();
    await expect(page.getByTestId('inspection-review-open')).toBeVisible();
  });

  test('refuses to submit a section that is only partly answered', async ({ page }) => {
    const id = await seedJob(page, ['ROAD_TEST']);
    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();

    await page.getByTestId('item-road.suspensionNoise-PASS').click();
    await page.getByTestId('save-section-ROAD_TEST').click();

    await expect(page.getByTestId('inspection-rail-ROAD_TEST')).toHaveAttribute('data-complete', 'false');
    await expect(page.getByTestId('inspection-submit')).toBeDisabled();
  });

  test('places a body-panel marker on the paint diagram and saves it', async ({ page }) => {
    const id = await seedJob(page, ['PAINT_BODY']);
    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();

    await expect(page.getByTestId('paint-diagram')).toBeVisible();
    // A diagram section needs a marker before it can be submitted.
    await expect(page.getByTestId('inspection-submit')).toBeDisabled();

    await page.getByTestId('paint-tool-FILLER').click();
    const surface = page.getByTestId('paint-canvas');
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    await surface.click({ position: { x: box!.width * 0.4, y: box!.height * 0.5 } });

    await expect(page.locator('[data-testid^="paint-marker-"]').first()).toBeVisible();
    await page.getByTestId('save-section-PAINT_BODY').click();
    await expect(page.getByTestId('inspection-submit')).toBeEnabled();
  });

  test('assesses the chassis regions on the safety diagram', async ({ page }) => {
    const id = await seedJob(page, ['CHASSIS_UNDERCARRIAGE']);
    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();

    await expect(page.getByTestId('chassis-diagram')).toBeVisible();
    await page.getByTestId('chassis-tool-OK').click();
    await page.getByTestId('chassis-region-FRONT').click();
    await page.getByTestId('chassis-region-REAR').click();
    await page.getByTestId('save-section-CHASSIS_UNDERCARRIAGE').click();
    await expect(page.getByTestId('inspection-submit')).toBeEnabled();
  });

  test('records a computer-unit fault and can remove it again', async ({ page }) => {
    const id = await seedJob(page, ['COMPUTER_UNIT']);
    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();

    await expect(page.getByTestId('diagnostic-list')).toBeVisible();
    await page.getByTestId('diagnostic-module').fill('ECM');
    await page.getByTestId('diagnostic-code').fill('P0171');
    await page.getByTestId('diagnostic-description').fill('System too lean (bank 1)');
    await page.getByTestId('diagnostic-add').click();

    const entry = page.locator('[data-testid^="diagnostic-"]').filter({ hasText: 'P0171' }).first();
    await expect(entry).toBeVisible();

    await entry.locator('[data-testid^="diagnostic-remove-"]').click();
    await expect(page.locator('[data-testid^="diagnostic-"]').filter({ hasText: 'P0171' })).toHaveCount(0);
  });

  test('approves a submitted inspection and then freezes it', async ({ page }) => {
    const id = await seedJob(page, ['INTERIOR']);
    const token = await apiToken(page, ENTERPRISE_ADMIN);
    await page.evaluate(
      async ({ api, token, id }) => {
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        await fetch(`${api}/automotive/inspections/${id}/sections/INTERIOR`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            items: [
              'interior.doors',
              'interior.controlKeys',
              'interior.clusterControl',
              'interior.cupHolder',
              'interior.steeringWheel',
              'interior.audio',
              'interior.sunroof',
              'interior.acVents',
              'interior.rearViewMirror',
              'interior.carpet',
              'interior.cigaretteLighter',
              'interior.otherParts',
            ].map((itemKey) => ({ itemKey, result: 'PASS' })),
          }),
        });
        const submitted = await fetch(`${api}/automotive/inspections/${id}/submit`, { method: 'POST', headers });
        if (!submitted.ok) throw new Error(`Submit failed: ${submitted.status}`);
      },
      { api: API, token, id },
    );

    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();
    await expect(page.getByTestId('inspection-review-open')).toBeVisible();

    await page.getByTestId('inspection-review-open').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(1);
    await page.getByTestId('inspection-review-notes').fill('Verified against the customer report.');
    await page.getByTestId('inspection-approve').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(0);

    // Approved: the checklist is no longer editable and submit is gone.
    await expect(page.getByTestId('save-section-INTERIOR')).toHaveCount(0);
    await expect(page.getByTestId('inspection-submit')).toHaveCount(0);
  });

  test('renders the workspace in Arabic with RTL direction', async ({ page }) => {
    const id = await seedJob(page, ['EXTERIOR', 'ENGINE_COMPARTMENT']);
    await page.goto('/automotive/inspections');
    await setLocale(page, 'ar');

    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-dir', 'rtl');

    // The rail carries the Arabic section names from the shared catalogue.
    await expect(page.getByTestId('inspection-rail-EXTERIOR')).toContainText('الفحص الخارجي');
    await expect(page.getByTestId('inspection-rail-ENGINE_COMPARTMENT')).toContainText('حجرة المحرك');
    await expectNoServerError(page);
  });
});
