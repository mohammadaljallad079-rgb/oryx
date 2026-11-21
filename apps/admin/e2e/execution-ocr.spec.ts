import { expect, request, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, SUPER_ADMIN, expectNoServerError, setLocale, signIn } from './helpers';

/**
 * Registration-card OCR acceptance (brief §5, vehicles).
 *
 * The test drives the real interface: an operator opens a vehicle's documents,
 * attaches a scan and presses "read the scan". The suggested fields must appear
 * for review, and the extraction must not create a document on its own.
 */

const API = (process.env.ORYX_API ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

/** A tiny valid PNG, used as the scan. */
const SCAN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAOklEQVR42u3OMQEAAAgDoC252/hn0AsJqGmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJH0eFQMBAWvT7wAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Store or clear the OCR provider credentials through the real API from a
 * cookie-less context, so CsrfGuard has nothing to reject and the call is
 * deterministic.
 */
async function setOcrCredentials(baseUrl: string, apiKey: string): Promise<void> {
  const loginCtx = await request.newContext();
  let token: string;
  try {
    const login = await loginCtx.post(`${API}/auth/login`, {
      data: { email: SUPER_ADMIN.email, password: SUPER_ADMIN.password },
    });
    expect(login.ok(), `login failed with ${login.status()}`).toBe(true);
    token = ((await login.json()) as { accessToken: string }).accessToken;
  } finally {
    await loginCtx.dispose();
  }

  const ctx = await request.newContext();
  try {
    const res = await ctx.put(`${API}/integrations/REGISTRATION_OCR/credentials`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        credentials: [
          { key: 'OCR_API_KEY', value: apiKey },
          { key: 'OCR_BASE_URL', value: baseUrl },
        ],
      },
    });
    expect(res.ok(), `credential write failed with ${res.status()}`).toBe(true);
  } finally {
    await ctx.dispose();
  }
}

test.describe('Registration-card OCR — vehicle documents', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test('reads a scan and offers its fields for review without saving a document', async ({ page }) => {
    // Configure the deterministic provider, then remove it again so the
    // integrations centre is left exactly as the other suites expect.
    await setOcrCredentials('test://deterministic', 'test-key');
    try {
      await page.goto('/automotive/inspections');
      await page.getByTestId('inspections-tab-vehicles').click();
      const docsButton = page.locator('[data-testid^="vehicle-documents-"]').first();
      await expect(docsButton).toBeVisible({ timeout: 20_000 });
      await docsButton.click();
      await expect(page.getByTestId('vehicle-documents')).toBeVisible({ timeout: 20_000 });

      const before = await page.locator('[data-testid^="document-row-"]').count();

      await page.getByTestId('document-file').setInputFiles({
        name: 'oryx-ocr-card.png',
        mimeType: 'image/png',
        buffer: SCAN_PNG,
      });
      await page.getByTestId('extract-document').click();

      // The suggestion panel appears with the extracted values and a review note.
      await expect(page.getByTestId('ocr-suggestions')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('ocr-suggestions')).toContainText('REG-DET-0001');
      await expect(page.getByTestId('ocr-notice')).toContainText(/correct them if needed/i);
      // The suggestion is written into the form for the operator to confirm.
      await expect(page.getByTestId('document-number')).toHaveValue('REG-DET-0001');

      // Nothing was saved: extraction is a suggestion, not a write.
      expect(await page.locator('[data-testid^="document-row-"]').count()).toBe(before);
      await expectNoServerError(page);
    } finally {
      await setOcrCredentials('', '');
    }
  });

  test('reports honestly when no OCR provider is configured', async ({ page }) => {
    // Clear any credentials left by another run.
    await setOcrCredentials('', '');
    await page.goto('/automotive/inspections');
    await page.getByTestId('inspections-tab-vehicles').click();
    const docsButton = page.locator('[data-testid^="vehicle-documents-"]').first();
    await expect(docsButton).toBeVisible({ timeout: 20_000 });
    await docsButton.click();
    await expect(page.getByTestId('vehicle-documents')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('document-file').setInputFiles({
      name: 'oryx-ocr-card.png',
      mimeType: 'image/png',
      buffer: SCAN_PNG,
    });
    await page.getByTestId('extract-document').click();

    await expect(page.getByTestId('ocr-notice')).toContainText(/no ocr provider/i, { timeout: 20_000 });
    await expect(page.getByTestId('ocr-suggestions')).toHaveCount(0);
    await expectNoServerError(page);
  });
});
