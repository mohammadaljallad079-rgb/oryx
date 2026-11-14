import { expect, test, type Page } from '@playwright/test';
import { inspectionSectionSpec } from '@oryx/shared';
import { ENTERPRISE_ADMIN, apiToken, expectNoServerError, setLocale, signIn } from './helpers';

/**
 * The official-document surfaces.
 *
 * Drives the real interface against the real API: an inspection is approved
 * through HTTP, the report is issued from the workspace, the register is read
 * from the documents page, the PDF is fetched and the QR token is verified
 * anonymously. Nothing is stubbed.
 *
 * The item keys a section must answer come from the shared section catalogue.
 * They are computed here and passed into `page.evaluate`, because a closure
 * cannot reference a module import once it has been serialised into the page.
 */

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

/** `{ INTERIOR: ['interior.doors', …] }` for the sections a test will complete. */
function itemKeysFor(areas: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const area of areas) out[area] = inspectionSectionSpec(area as never).items.map((i) => i.key);
  return out;
}

/** Approve a fresh inspection over HTTP and return it. */
async function approvedInspection(page: Page, areas: string[]): Promise<{ id: string; jobNumber: string }> {
  const token = await apiToken(page, ENTERPRISE_ADMIN);
  const keys = itemKeysFor(areas);
  return page.evaluate(
    async ({ api, token, areas, keys }) => {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const customers = (await (await fetch(`${api}/sales/customers?pageSize=50`, { headers })).json()) as {
        items: Array<{ id: string }>;
      };
      // First customer that owns a vehicle; sibling specs leave bare customers
      // behind that would otherwise be indexed here (see the phase-2 spec).
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
      const session = (await created.json()) as { id: string; jobNumber: string };

      for (const area of areas) {
        const itemKeys = keys[area] ?? [];
        const body: Record<string, unknown> = { noFindings: true };
        if (itemKeys.length > 0) body.items = itemKeys.map((itemKey) => ({ itemKey, result: 'PASS' }));
        const saved = await fetch(`${api}/automotive/inspections/${session.id}/sections/${area}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        });
        if (!saved.ok) throw new Error(`Section ${area} failed: ${saved.status} ${await saved.text()}`);
      }
      for (const [path, body] of [
        [`/automotive/inspections/${session.id}/submit`, {}],
        [`/automotive/inspections/${session.id}/review`, { decision: 'APPROVE' }],
      ] as Array<[string, unknown]>) {
        const res = await fetch(`${api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
      }
      return session;
    },
    { api: API, token, areas, keys },
  );
}

/** Create a draft inspection, unapproved. */
async function draftInspection(page: Page): Promise<{ id: string }> {
  const token = await apiToken(page, ENTERPRISE_ADMIN);
  return page.evaluate(
    async ({ api, token }) => {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const customers = (await (await fetch(`${api}/sales/customers?pageSize=50`, { headers })).json()) as {
        items: Array<{ id: string }>;
      };
      // The first customer with a vehicle, not the first customer — see the
      // note in the phase-2 spec: sibling specs leave bare customers behind.
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
        body: JSON.stringify({
          customerId,
          vehicleId,
          selectedAreas: ['INTERIOR'],
        }),
      });
      if (!created.ok) throw new Error(`Draft creation failed: ${created.status}`);
      return (await created.json()) as { id: string };
    },
    { api: API, token },
  );
}

test.describe('Execution Phase 3 — official documents', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    // The admin shell defaults to Arabic; the assertions below are English.
    await setLocale(page, 'en');
  });

  test('locks the report until the inspection is approved, then issues it', async ({ page }) => {
    const session = await draftInspection(page);

    await page.goto(`/automotive/inspections/${session.id}`);
    await expect(page.getByTestId('inspection-workspace')).toBeVisible();

    // A draft job has no report action and says why.
    await expect(page.getByTestId('inspection-report-locked')).toBeVisible();
    await expect(page.getByTestId('inspection-issue-report')).toHaveCount(0);
    await expect(page.getByTestId('documents-panel')).toHaveCount(0);
    await expectNoServerError(page);

    // Fill, submit and approve out of band, then reload.
    const token = await apiToken(page, ENTERPRISE_ADMIN);
    const keys = itemKeysFor(['INTERIOR']);
    await page.evaluate(
      async ({ api, token, id, keys }) => {
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        await fetch(`${api}/automotive/inspections/${id}/sections/INTERIOR`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ items: keys.INTERIOR.map((itemKey) => ({ itemKey, result: 'PASS' })) }),
        });
        await fetch(`${api}/automotive/inspections/${id}/submit`, { method: 'POST', headers, body: '{}' });
        await fetch(`${api}/automotive/inspections/${id}/review`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ decision: 'APPROVE' }),
        });
      },
      { api: API, token, id: session.id, keys },
    );

    await page.reload();
    await expect(page.getByTestId('documents-panel')).toBeVisible();
    await expect(page.getByTestId('documents-panel')).toContainText('Not issued yet');

    await page.getByTestId('inspection-issue-report').click();

    // The register shows the stored lifecycle state, which is `ISSUED` —
    // "Valid" is the public verification vocabulary and belongs on the scan
    // page, not in the register.
    const row = page.locator('[data-testid^="document-row-"]').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Inspection report');
    await expect(row).toContainText('Issued');
    await expect(row).toContainText('v1');
    await expectNoServerError(page);
  });

  test('opens the stored PDF and copies the verification link', async ({ page }) => {
    const session = await approvedInspection(page, ['INTERIOR']);
    await page.goto(`/automotive/inspections/${session.id}`);
    await page.getByTestId('inspection-issue-report').click();
    const row = page.locator('[data-testid^="document-row-"]').first();
    await expect(row).toBeVisible();

    // The control opens an in-page frame over a blob URL. It is not a popup:
    // the bytes need the staff token, so they are fetched asynchronously and a
    // `window.open` after that await would hand back a blank tab.
    await row.locator('[data-testid^="document-open-"]').click();
    const frame = page.getByTestId('document-frame');
    await expect(frame).toBeVisible({ timeout: 15_000 });
    await expect(frame).toHaveAttribute('src', /^blob:/, { timeout: 15_000 });
    await expect(page.getByTestId('document-download')).toBeEnabled();
    await expect(page.getByTestId('document-print')).toBeEnabled();
    await page.getByTestId('document-preview-close').click();
    await expect(frame).toHaveCount(0);

    // The bytes behind that control are a real multi-page PDF, fetched through
    // the same endpoint the panel calls.
    const adminToken = await apiToken(page, ENTERPRISE_ADMIN);
    const pdf = await page.evaluate(
      async ({ api, id, adminToken }) => {
        const list = await fetch(`${api}/documents?sourceType=InspectionSession&sourceId=${id}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const rows = (await list.json()) as Array<{ id: string; pageCount: number; downloadable: boolean }>;
        const file = await fetch(`${api}/documents/${rows[0].id}/file`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const buffer = await file.arrayBuffer();
        const head = new TextDecoder('latin1').decode(new Uint8Array(buffer.slice(0, 8)));
        const text = new TextDecoder('latin1').decode(new Uint8Array(buffer));
        return {
          status: file.status,
          contentType: file.headers.get('content-type') ?? '',
          head,
          hasMediaBox: text.includes('/MediaBox'),
          hasArabicFace: text.includes('Arial'),
          pageCount: rows[0].pageCount,
          storedPageCount: Math.max(...[...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]))),
        };
      },
      { api: API, id: session.id, adminToken },
    );
    expect(pdf.status).toBe(200);
    expect(pdf.contentType).toContain('pdf');
    // The Chromium build that renders the PDF chooses the version it writes, so
    // the assertion pins the signature, not one particular revision; a newer
    // Chromium emits `%PDF-1.7` for the same document.
    expect(pdf.head).toMatch(/^%PDF-1\.\d/);
    expect(pdf.hasMediaBox).toBe(true);
    expect(pdf.hasArabicFace).toBe(true);
    expect(pdf.storedPageCount).toBe(pdf.pageCount);

    // The verification link is the public route carrying the QR token.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await row.getByRole('button', { name: 'Copy verification link' }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('/verify/');
  });

  test('withdraws a document and reports it as withdrawn on a rescan', async ({ page }) => {
    const session = await approvedInspection(page, ['INTERIOR']);
    await page.goto(`/automotive/inspections/${session.id}`);
    await page.getByTestId('inspection-issue-report').click();

    const row = page.locator('[data-testid^="document-row-"]').first();
    await expect(row).toBeVisible();

    await row.locator('[data-testid^="document-revoke-"]').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(1);
    // The confirm button stays disabled until a reason is given.
    await expect(page.getByTestId('document-revoke-confirm')).toBeDisabled();
    await page.getByTestId('document-revoke-reason').fill('Issued against the wrong job number.');
    await page.getByTestId('document-revoke-confirm').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(0);
    await expect(page.locator('[data-testid^="document-row-"]').first()).toContainText('Withdrawn');

    // A public scan now reports the withdrawal rather than a 404.
    const adminToken = await apiToken(page, ENTERPRISE_ADMIN);
    const verify = await page.evaluate(
      async ({ api, id, adminToken }) => {
        const list = await fetch(`${api}/documents?sourceType=InspectionSession&sourceId=${id}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const rows = (await list.json()) as Array<{ verificationToken: string }>;
        const res = await fetch(`${api}/documents/verify/${rows[0].verificationToken}`);
        return (await res.json()) as { found: boolean; document: { status: string } };
      },
      { api: API, id: session.id, adminToken },
    );
    expect(verify.found).toBe(true);
    expect(verify.document.status).toBe('REVOKED');
    await expectNoServerError(page);
  });

  test('labels the register status in Arabic without printing the raw enum', async ({ page }) => {
    const session = await approvedInspection(page, ['INTERIOR']);
    await page.goto(`/automotive/inspections/${session.id}`);
    await page.getByTestId('inspection-issue-report').click();

    const row = page.locator('[data-testid^="document-row-"]').first();
    await expect(row).toBeVisible();
    await setLocale(page, 'ar');

    // The register localises the stored status: an Arabic interface must not
    // print `ISSUED`, and it must not borrow the public word "Valid" either.
    await expect(row).toContainText('صادر');
    await expect(row).not.toContainText('ISSUED');
    await expect(row).not.toContainText('Valid');

    // Withdraw it and confirm the Arabic label changes to the withdrawn word.
    await row.locator('[data-testid^="document-revoke-"]').click();
    await page.getByTestId('document-revoke-reason').fill('رقم المهمة غير صحيح.');
    await page.getByTestId('document-revoke-confirm').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(0);
    await expect(page.locator('[data-testid^="document-row-"]').first()).toContainText('مسحوب');
    await expectNoServerError(page);
  });

  test('registers the documents page and rejects a blank lookup', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible();

    // The register is the landing view; the issue-by-source lookup is a tab.
    await expect(page.getByTestId('document-register')).toBeVisible();
    await page.getByTestId('documents-tab-issue').click();
    await expect(page.getByText('Choose a source record')).toBeVisible();

    // Submitting with no id keeps the empty state rather than querying.
    await page.getByTestId('documents-lookup').click();
    await expect(page.getByText('Choose a source record')).toBeVisible();
    await expectNoServerError(page);
  });

  test('the public verification page is served by the customer site', async ({ request }) => {
    // The customer site owns the canonical public verification page. A request
    // to that origin proves the page ships and does not 500 on an unknown
    // token, without conflating the two surfaces.
    const customerBase = process.env.ORYX_CUSTOMER_URL ?? 'http://localhost:3002';
    const res = await request.get(`${customerBase}/verify/this-token-does-not-exist-0000000000`);
    expect(res.status()).toBeLessThan(500);
    const body = await res.text();
    expect(body).not.toContain('Internal Server Error');
  });

  test('the admin origin also answers a scanned QR code', async ({ request }) => {
    // A printed document's QR embeds `<origin>/verify/<token>`. Documents were
    // issued against the admin origin, and a printed code cannot be recalled,
    // so a scan of an already-printed report or invoice must resolve on the
    // admin host too. The admin app therefore serves the same read-only page;
    // this guards against dropping it and reviving the 404 that made every
    // printed code a dead link.
    const adminBase = process.env.ORYX_ADMIN_URL ?? 'http://localhost:3000';
    const res = await request.get(`${adminBase}/verify/this-token-does-not-exist-0000000000`);
    expect(res.status()).toBeLessThan(500);
    const body = await res.text();
    expect(body).not.toContain('Internal Server Error');
  });
});
