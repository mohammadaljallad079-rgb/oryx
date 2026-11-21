import { expect, test, type Page } from '@playwright/test';
import {
  ENTERPRISE_ADMIN,
  apiToken,
  expectNoServerError,
  pickOption,
  setLocale,
  signIn,
} from './helpers';

/**
 * The interactive vehicle inspection workspace.
 *
 * These tests drive the real interface against the real API: a job is created
 * from the list page, opened, filled in on the section editors and pushed
 * through submit and approval. Nothing is stubbed, so a broken API contract or a
 * missing permission fails here rather than in production.
 */

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

/** A minimal but structurally valid single-page PDF, used as a diagnostic scan. */
const DIAGNOSTIC_PDF = Buffer.from(
  `%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 120] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 46 >>
stream
BT /F1 12 Tf 20 60 Td (Diagnostic report) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`,
  'latin1',
);

/** The seeded vehicle that belongs to the first seeded customer. */
async function seedJob(page: Page, areas: string[]): Promise<string> {
  const token = await apiToken(page, ENTERPRISE_ADMIN);
  return page.evaluate(
    async ({ api, token, areas }) => {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const customers = (await (await fetch(`${api}/sales/customers?pageSize=50`, { headers })).json()) as {
        items: Array<{ id: string }>;
      };
      // Pick the first customer that actually owns a vehicle. Other specs
      // (document attachments) create bare customers that sort ahead of the
      // seeded ones, so indexing blindly into the list would hand the job a
      // customer with no vehicle and fail on an unrelated test's leftovers.
      let customerId = '';
      let vehicleId = '';
      for (const candidate of customers.items) {
        const vehicles = (await (
          await fetch(`${api}/automotive/vehicles?customerId=${candidate.id}`, { headers })
        ).json()) as { items: Array<{ id: string }> };
        if (vehicles.items.length > 0) {
          customerId = candidate.id;
          vehicleId = vehicles.items[0].id;
          break;
        }
      }
      const created = await fetch(`${api}/automotive/inspections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ customerId, vehicleId, selectedAreas: areas }),
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

    // Every selectable inspection type is offered, in English. The approved
    // report has exactly four check sections, so the form offers four types and
    // never the seven internal storage areas.
    await expect(page.getByTestId('job-types')).toBeVisible();
    await expect(page.getByTestId('job-type-PAINT_BODY')).toBeVisible();
    await expect(page.getByTestId('job-type-CHASSIS_UNDERCARRIAGE')).toBeVisible();
    await expect(page.getByTestId('job-type-CABIN_AND_MECHANICAL')).toBeVisible();
    await expect(page.getByTestId('job-type-COMPUTER_UNIT')).toBeVisible();
    await expect(page.getByTestId('job-type-INTERIOR')).toHaveCount(0);

    // Select the seeded Toyota owner by name rather than by position: sibling
    // specs create bare customers that sort to the top of the list, so an
    // index-based pick would land on a customer with no vehicles.
    await pickOption(page, 'job-customer', { label: 'Al Noor Trading Est.' });

    // The vehicle list must be scoped to the chosen customer and must never be
    // offered from a stale, unfiltered fetch. The second seeded customer owns
    // the Nissan, so its VIN appearing here would mean the previous customer's
    // vehicles leaked into the selector — the defect that let an operator pick
    // another customer's car and have the server reject the job. The picker is
    // a searchable combobox, so the options are read from the opened list.
    const vehicleInput = page.getByTestId('job-vehicle-input');
    await expect(vehicleInput).toBeEnabled();
    await vehicleInput.click();
    const options = page.getByTestId('job-vehicle-list').locator('[role="option"]');
    await expect(options.first()).toBeVisible();
    const vehicleOptions = await options.allInnerTexts();
    expect(vehicleOptions.some((text) => text.includes('JN1TBNT32Z0123456'))).toBe(false);

    await options.first().click();
    await expect(page.getByTestId('job-vehicle-identity')).toBeVisible();
    // The cabin type is one selectable type that expands to the interior,
    // exterior, engine-compartment and road-test sections server-side.
    await page.getByTestId('job-type-CABIN_AND_MECHANICAL').click();
    await page.getByTestId('create-inspection-job').click();

    // Creating a job now opens its workspace immediately. The previous test
    // expected to stay on the list, so the row vanished on successful routing.
    await page.waitForURL(/\/automotive\/inspections\/[^/]+$/, { timeout: 20_000 });
    await expect(page.locator('.oryx-modal')).toHaveCount(0);
    const workspace = page.getByTestId('inspection-workspace');
    await expect(workspace).toBeVisible({ timeout: 20_000 });
    // The report/session identifier uses a single leading Z and five digits.
    await expect(workspace).toContainText(/Z\d{5}/);
    await expectNoServerError(page);

    // The identity block carries the real vehicle, and the header names it.
    await expect(page.getByTestId('inspection-identity')).toContainText('JTMHV05J204123456');
    await expect(page.getByTestId('inspection-workspace')).toContainText('Toyota');

    // The rail shows the four areas the cabin type expands to, and never a
    // section outside the selected types.
    await expect(page.getByTestId('inspection-rail')).toBeVisible();
    await expect(page.getByTestId('inspection-rail-INTERIOR')).toBeVisible();
    await expect(page.getByTestId('inspection-rail-EXTERIOR')).toBeVisible();
    await expect(page.getByTestId('inspection-rail-ENGINE_COMPARTMENT')).toBeVisible();
    await expect(page.getByTestId('inspection-rail-ROAD_TEST')).toBeVisible();
    await expect(page.getByTestId('inspection-rail-PAINT_BODY')).toHaveCount(0);
    await expect(page.getByTestId('inspection-rail-COMPUTER_UNIT')).toHaveCount(0);
  });

  test('the entry form carries the same fields the report cover prints', async ({ page }) => {
    await page.goto('/automotive/inspections');
    await setLocale(page, 'en');
    await page.getByTestId('new-inspection-job').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(1);

    // The report cover prints these eleven labels verbatim; the entry form must
    // offer a matching input for every one of them, under the same wording, so
    // the screen the operator fills mirrors the document the customer receives.
    const identity = page.getByTestId('job-vehicle-identity');
    await expect(identity).toContainText('Vehicle Information');
    for (const label of [
      'Customer Name',
      'Contact No.',
      'Date & Time',
      'Job No.',
      'Plate No.',
      'Car Make',
      'Car Model',
      'Car Year',
      'ODO Meter',
      'Car Color',
      'VIN Number',
    ]) {
      await expect(identity).toContainText(label);
    }

    // Date & Time and Job No. are assigned by the system, so they are read-only
    // mirror values; the nine identification fields are editable inputs.
    await expect(page.getByTestId('job-inspected-at')).toBeDisabled();
    await expect(page.getByTestId('job-number')).toBeDisabled();
    for (const key of [
      'customerName',
      'contactNumber',
      'plateNumber',
      'make',
      'model',
      'modelYear',
      'odometer',
      'color',
      'vin',
    ]) {
      await expect(page.getByTestId(`job-field-${key}`)).toBeEditable();
    }

    // The block mirrors the report's cover *structure*, not only its wording:
    // eleven cells laid out in a four-column grid whose last row closes with the
    // VIN spanning two columns, exactly as the printed table is drawn. A drift
    // in either the cell count or the VIN span would mean the screen and the
    // document no longer agree on the identification layout.
    const layout = await identity.evaluate((el) => {
      const grid = el.querySelector('.oryx-doc-form__cover-grid') as HTMLElement | null;
      const cells = [...(grid?.querySelectorAll('.oryx-doc-form__cover-cell') ?? [])] as HTMLElement[];
      const rows = new Map<number, number>();
      for (const cell of cells) {
        const top = Math.round(cell.getBoundingClientRect().top);
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      const vin = el.querySelector('[data-testid="job-field-vin"]') as HTMLElement | null;
      const vinCell = vin?.closest('.oryx-doc-form__cover-cell') as HTMLElement | null;
      const vinBox = vinCell?.getBoundingClientRect();
      const firstBox = cells[0]?.getBoundingClientRect();
      return {
        hasBand: Boolean(el.querySelector('.oryx-doc-form__cover-band')),
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        cells: cells.length,
        rowCounts: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n),
        vinSpansTwo: Boolean(vinBox && firstBox && vinBox.width > firstBox.width * 1.5),
      };
    });
    expect(layout.hasBand).toBe(true);
    expect(layout.columns).toBe(4);
    expect(layout.cells).toBe(11);
    expect(layout.rowCounts).toEqual([4, 4, 3]);
    expect(layout.vinSpansTwo).toBe(true);

    // Choosing a vehicle prefills the cover fields from the vehicle record, so
    // the report prints the same identification the picker showed.
    await pickOption(page, 'job-customer', { label: 'Al Noor Trading Est.' });
    await page.getByTestId('job-vehicle-input').click();
    await page.getByTestId('job-vehicle-list').locator('[role="option"]').first().click();
    await expect(page.getByTestId('job-field-make')).toHaveValue('Toyota');
    await expect(page.getByTestId('job-field-vin')).toHaveValue('JTMHV05J204123456');
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
    await page.getByTestId('save-sections-group').click();

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
    await page.getByTestId('save-sections-group').click();

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

  test('records computer-unit notes without creating a fault and allows submission', async ({ page }) => {
    const id = await seedJob(page, ['COMPUTER_UNIT']);
    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();
    await expect(page.getByTestId('diagnostic-list')).toHaveCount(0);
    await expect(page.getByTestId('diagnostic-add')).toHaveCount(0);
    await expect(page.getByTestId('attachment-input')).toBeVisible();

    await page.getByTestId('remarks-COMPUTER_UNIT').fill('Computer scan examined; no fault entry required.');
    await page.getByTestId('save-section-COMPUTER_UNIT').click();
    // Saving the last selected computer-unit inspection now submits the complete
    // job for approval automatically; a manual Submit action is no longer needed.
    await expect(page.getByTestId('inspection-review-open')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('remarks-COMPUTER_UNIT')).toHaveValue('Computer scan examined; no fault entry required.');
  });

  test('adds an inspection type after creation but before approval', async ({ page }) => {
    const id = await seedJob(page, ['EXTERIOR']);
    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();

    // The job started with the exterior section only; the paint rail entry is
    // absent until the operator adds the type that records it.
    await expect(page.getByTestId('inspection-rail-EXTERIOR')).toBeVisible();
    await expect(page.getByTestId('inspection-rail-PAINT_BODY')).toHaveCount(0);

    await page.getByTestId('type-toggle-PAINT_BODY').click();

    // The new section appears on the rail with its own empty data, and the type
    // is now marked selected.
    await expect(page.getByTestId('inspection-rail-PAINT_BODY')).toBeVisible();
    await expect(page.getByTestId('type-PAINT_BODY')).toHaveAttribute('data-selected', 'true');
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
    await expect(page.getByTestId('save-sections-group')).toHaveCount(0);
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
    await expect(page.getByTestId('inspection-rail-ENGINE_COMPARTMENT')).toContainText('مقصورة المحرك');
    await expectNoServerError(page);
  });

  test('uploads a diagnostic PDF and opens it from the attachment list', async ({ page }) => {
    const id = await seedJob(page, ['EXTERIOR']);
    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();
    await expect(page.getByTestId('inspection-attachments')).toBeVisible();

    // A real, minimal PDF travels through the same multipart route the operator
    // uses; the API must accept a document (not only an image) and serve its
    // bytes back so the link opens a viewer rather than a broken image.
    await page.getByTestId('attachment-input').setInputFiles({
      name: 'diagnostic.pdf',
      mimeType: 'application/pdf',
      buffer: DIAGNOSTIC_PDF,
    });

    const card = page.getByTestId('inspection-attachments');
    const link = card.locator('[data-testid^="attachment-open-"]').first();
    await expect(link).toBeVisible({ timeout: 20_000 });
    await expect(link).toContainText('diagnostic.pdf');

    // Fetching the link returns the stored PDF bytes with the PDF content type.
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    const served = await page.request.get(href!);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toContain('application/pdf');
    expect((await served.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  test('offers a single optional notes field and submits a fully passing inspection with it empty', async ({ page }) => {
    const id = await seedJob(page, ['EXTERIOR']);
    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();

    // Exactly one section-specific notes field; no duplicate global editor.
    await expect(page.getByTestId('remarks-EXTERIOR')).toHaveCount(1);
    await expect(page.getByTestId('inspection-notes')).toHaveCount(0);
    await expect(page.getByTestId('final-assessment')).toHaveCount(0);

    // Notes are optional: a fully passing inspection submits with the field
    // untouched. Answer every item, save the section and submit without notes.
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
    await page.getByTestId('save-sections-group').click();
    await expect(page.getByTestId('inspection-submit')).toBeEnabled();
    await page.getByTestId('inspection-submit').click();
    await expect(page.getByTestId('inspection-review-open')).toBeVisible();
  });

  test('persists the inspection notes and reloads them', async ({ page }) => {
    const id = await seedJob(page, ['EXTERIOR']);
    await page.goto(`/automotive/inspections/${id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();

    await page.getByTestId('remarks-EXTERIOR').fill('Minor stone chips on the front bumper.');
    await page.getByTestId('save-sections-group').click();
    await expect(page.getByTestId('remarks-EXTERIOR')).toHaveValue('Minor stone chips on the front bumper.');

    // Reload from the server: the section note is stored, not held in component state.
    await page.reload();
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();
    await expect(page.getByTestId('remarks-EXTERIOR')).toHaveValue('Minor stone chips on the front bumper.');
  });
});
