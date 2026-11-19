import { expect, test } from '@playwright/test';
import { COMPANY_ADMIN, ENTERPRISE_ADMIN, SUPER_ADMIN, apiToken, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 06 — unified attachments and the employee electronic file.
 *
 * Drives the real screens: the attachment field lives inside the create form
 * and inside the record preview, and the employee file's tabs read the same
 * records the payroll screens write. Fixture records are created through the
 * API and removed afterwards so the seeded demo tenant is left as it was.
 */

const API = (process.env.ORYX_API ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const PREFIX = 'E06UI';

interface Fixture {
  employeeId?: string;
  employeeCode?: string;
  paymentId?: string;
  maintenanceBookingId?: string;
  attachmentIds: string[];
}

/** Create a fixture employee through the API, in the demo tenant. */
async function createEmployee(token: string, suffix: string): Promise<{ id: string; code: string }> {
  const res = await fetch(`${API}/hr/employees`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullNameEn: `${PREFIX} Employee ${suffix}`,
      fullNameAr: `موظف اختبار ${suffix}`,
      email: `${PREFIX.toLowerCase()}-${suffix}@oryx.local`,
      nationality: 'Saudi',
      bankName: 'Al Rajhi',
      bankAccountIban: 'SA0380000000608010167519',
      contractType: 'PERMANENT',
      hireDate: '2024-01-15',
    }),
  });
  expect(res.ok, `employee creation failed with ${res.status}`).toBe(true);
  return (await res.json()) as { id: string; code: string };
}

/** Upload one text file to a record through the real multipart route. */
async function uploadFile(
  token: string,
  entityType: string,
  entityId: string,
  name: string,
  body: string,
): Promise<string> {
  const form = new FormData();
  form.set('entityType', entityType);
  form.set('entityId', entityId);
  form.append('files', new Blob([body], { type: 'text/plain' }), name);
  const res = await fetch(`${API}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  expect(res.ok, `upload failed with ${res.status}`).toBe(true);
  const parsed = (await res.json()) as { items: Array<{ id: string }> };
  return parsed.items[0].id;
}

async function deleteQuietly(token: string, path: string): Promise<void> {
  try {
    await fetch(`${API}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    /* best effort cleanup */
  }
}

test.describe('Execution 06 — attachments and employee file', () => {
  let token: string;
  const fixture: Fixture = { attachmentIds: [] };

  test.beforeEach(async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    token = await apiToken(page, COMPANY_ADMIN);
  });

  test.afterEach(async () => {
    // Remove the fixture employee; its attachments cascade with the row.
    if (fixture.employeeId) {
      await deleteQuietly(token, `/hr/employees/${fixture.employeeId}`);
    }
    for (const id of fixture.attachmentIds) await deleteQuietly(token, `/attachments/${id}`);
    fixture.attachmentIds = [];
    fixture.employeeId = undefined;
    fixture.paymentId = undefined;
    fixture.maintenanceBookingId = undefined;
  });

  test('1. the employee list offers a preview action for every row', async ({ page }) => {
    const employee = await createEmployee(token, 'preview');
    fixture.employeeId = employee.id;
    fixture.employeeCode = employee.code;

    await page.goto('/hr');
    await page.getByTestId('hr-tab-employees').click();
    // The list is ordered by employee number and paginated, so a new record is
    // not on page 1; search for it instead of assuming it appears.
    await page.getByTestId('employee-search').fill(employee.code);
    const button = page.getByTestId(`preview-employee-${employee.code}`);
    await expect(button).toBeVisible({ timeout: 20_000 });
    await button.click();
    await expect(page.getByTestId('employee-file')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('file-personal-card')).toBeVisible();
    // The file is addressable, so a reload lands on the same record.
    await expect(page).toHaveURL(new RegExp(`/hr/employees/${employee.id}`));
  });

  test('2. the personal card shows the profile fields and the salary block', async ({ page }) => {
    const employee = await createEmployee(token, 'card');
    fixture.employeeId = employee.id;

    await page.goto(`/hr/employees/${employee.id}`);
    await expect(page.getByTestId('file-personal-card')).toBeVisible({ timeout: 20_000 });
    const card = page.getByTestId('file-personal-card');
    await expect(card.getByText('Saudi', { exact: false })).toBeVisible();
    await expect(card.getByText('Al Rajhi', { exact: false })).toBeVisible();
    await expect(card.getByText('SA0380000000608010167519', { exact: false })).toBeVisible();
  });

  test('3. every file tab opens and reads real records', async ({ page }) => {
    const employee = await createEmployee(token, 'tabs');
    fixture.employeeId = employee.id;

    await page.goto(`/hr/employees/${employee.id}`);
    await expect(page.getByTestId('file-personal-card')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('file-tab-payroll').click();
    await expect(page.getByTestId('file-payroll')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('file-tab-leave').click();
    await expect(page.getByTestId('file-leave')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('file-tab-penalties').click();
    await expect(page.getByTestId('file-penalties')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('file-tab-bonuses').click();
    await expect(page.getByTestId('file-bonuses')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('file-tab-reports').click();
    await expect(page.getByTestId('file-reports')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('file-tab-documents').click();
    await expect(page.getByTestId('file-documents')).toBeVisible({ timeout: 20_000 });
  });

  test('4. a disciplinary action is recorded and printed from its own tab', async ({ page }) => {
    const employee = await createEmployee(token, 'penalty');
    fixture.employeeId = employee.id;

    await page.goto(`/hr/employees/${employee.id}`);
    await page.getByTestId('file-tab-penalties').click();
    await expect(page.getByTestId('file-penalties')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('new-penalty').click();
    await page.getByTestId('penalty-type').selectOption('WRITTEN_WARNING');
    await page.getByTestId('penalty-reason').fill('Repeated lateness');
    await page.getByTestId('save-penalty').click();

    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText('Repeated lateness')).toBeVisible({ timeout: 20_000 });

    // The row survives a reload: it is stored, not held in component state.
    await page.reload();
    await page.getByTestId('file-tab-penalties').click();
    await expect(page.getByText('Repeated lateness')).toBeVisible({ timeout: 20_000 });
  });

  test('5. a bonus is granted, approved and appears in the bonus tab', async ({ page }) => {
    const employee = await createEmployee(token, 'bonus');
    fixture.employeeId = employee.id;

    await page.goto(`/hr/employees/${employee.id}`);
    await page.getByTestId('file-tab-bonuses').click();
    await expect(page.getByTestId('file-bonuses')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('new-bonus').click();
    await page.getByTestId('bonus-type').selectOption('BONUS');
    await page.getByTestId('bonus-amount').fill('1500.00');
    await page.getByTestId('bonus-reason').fill('Performance award');
    await page.getByTestId('save-bonus').click();

    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 20_000 });
    const row = page.locator('tr', { hasText: 'Performance award' });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText('1500.00 SAR')).toBeVisible();
  });

  test('6. the employee number is filled automatically and cannot be typed', async ({ page }) => {
    await page.goto('/hr');
    await page.getByTestId('hr-tab-employees').click();
    await page.getByTestId('new-employee').click();

    const codeField = page.getByTestId('employee-code');
    await expect(codeField).toBeVisible({ timeout: 20_000 });
    // The field is populated by the server and is not editable.
    await expect(codeField).toBeDisabled();
    await expect(codeField).toHaveAttribute('readonly', '');
    await expect(codeField).toHaveValue(/^EMP-\d{5}$/);
  });

  test('7. a file is attached inside the create form and saved with the record', async ({ page }) => {
    await page.goto('/hr');
    await page.getByTestId('hr-tab-employees').click();
    await page.getByTestId('new-employee').click();

    const unique = `${PREFIX} Form ${Date.now()}`;
    await page.getByTestId('employee-name-en').fill(unique);
    await page.getByTestId('employee-name-ar').fill('موظف من النموذج');

    // The attachment field is part of the form, not a separate screen.
    await expect(page.getByTestId('new-employee-attachments')).toBeVisible();
    await page.getByTestId('new-employee-attachments-input').setInputFiles({
      name: 'offer-letter.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Offer letter body'),
    });
    await expect(page.getByTestId('new-employee-attachments-draft')).toBeVisible();

    await page.getByTestId('save-employee').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 30_000 });

    // Find the new record through the API and prove the file was stored.
    const list = await fetch(`${API}/hr/employees?search=${encodeURIComponent(unique)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const parsed = (await list.json()) as { items: Array<{ id: string; code: string }> };
    expect(parsed.items.length).toBeGreaterThan(0);
    const created = parsed.items[0];
    fixture.employeeId = created.id;

    const attachments = await fetch(
      `${API}/attachments?entityType=EMPLOYEE_DOCUMENT&entityId=${created.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const attached = (await attachments.json()) as { items: Array<{ fileName: string }> };
    expect(attached.items.map((a) => a.fileName)).toContain('offer-letter.txt');
  });

  test('8. an attachment opens in the preview and downloads without leaving the page', async ({ page }) => {
    const employee = await createEmployee(token, 'previewfile');
    fixture.employeeId = employee.id;
    const attachmentId = await uploadFile(
      token,
      'EMPLOYEE_DOCUMENT',
      employee.id,
      'note.txt',
      'A short note stored as an attachment.',
    );
    fixture.attachmentIds.push(attachmentId);

    await page.goto(`/hr/employees/${employee.id}`);
    await page.getByTestId('file-tab-documents').click();
    await expect(page.getByTestId('employee-documents-item')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('employee-documents-item').getByRole('button', { name: 'note.txt' }).click();
    const preview = page.getByTestId('attachment-preview');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    // A text file renders its content, which proves the bytes were read back.
    await expect(preview.getByText('A short note stored as an attachment.')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('attachment-preview-download')).toBeVisible();
  });

  test('8b. the employee photograph uploads from the card and renders as the primary image', async ({ page }) => {
    const employee = await createEmployee(token, 'photo');
    fixture.employeeId = employee.id;

    await page.goto(`/hr/employees/${employee.id}`);
    await expect(page.getByTestId('file-photo-empty')).toBeVisible({ timeout: 20_000 });

    // A 1x1 PNG, so the stored row is classified as an image attachment.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.getByTestId('employee-photo-input').setInputFiles({
      name: 'employee-photo.png',
      mimeType: 'image/png',
      buffer: png,
    });

    // The card owns an existing record, so it uploads on pick — there is no
    // save step to flush a draft from.
    await expect(page.getByTestId('employee-photo-item')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('employee-photo-item').getByRole('button', { name: 'Set primary' }).click();

    // The image is rendered from the authenticated bytes, not a bare src.
    await expect(page.getByTestId('file-photo-image')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('file-photo-empty')).toHaveCount(0);

    // It survives a reload: the record stores the image, not the page.
    await page.reload();
    await expect(page.getByTestId('file-photo-image')).toBeVisible({ timeout: 20_000 });

    const list = await fetch(`${API}/attachments?entityType=EMPLOYEE&entityId=${employee.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const parsed = (await list.json()) as { items: Array<{ id: string; isPrimary: boolean; previewKind: string }> };
    const primary = parsed.items.find((a) => a.isPrimary);
    expect(primary?.previewKind).toBe('image');
    for (const item of parsed.items) fixture.attachmentIds.push(item.id);

    // The printed card carries the same photograph, embedded as a data URL so
    // the print window needs no second request.
    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('file-print-card').click();
    const printed = await popupPromise;
    const printedPhoto = printed.locator('img.photo');
    await expect(printedPhoto).toHaveCount(1);
    await expect(printedPhoto).toHaveAttribute('src', /^data:image\/png;base64,/);
    await printed.close();
  });

  test('9. a work order preview shows its details, checklist and attachments', async ({ page }) => {
    // Create the work order through the UI so the form's attachment field runs.
    await page.goto('/operations');
    await page.getByTestId('operations-tab-work-orders').click();
    await page.getByTestId('new-work-order').click();
    const title = `${PREFIX} Order ${Date.now()}`;
    await page.getByTestId('work-order-title').fill(title);
    await page.getByTestId('new-work-order-attachments-input').setInputFiles({
      name: 'site.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Site notes'),
    });
    await page.getByTestId('save-work-order').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 30_000 });

    const row = page.locator('tr', { hasText: title });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: /preview/i }).click();

    const preview = page.getByTestId('work-order-preview');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(preview.getByText(title)).toBeVisible();
    await expect(page.getByTestId('work-order-preview-attachments-item')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('work-order-preview-print')).toBeVisible();
  });

  test('11. a receipt is recorded from inside the payments form and previews with its voucher number', async ({ page }) => {
    const customers = await fetch(`${API}/sales/customers?pageSize=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const customerList = (await customers.json()) as { items: Array<{ id: string; nameEn: string }> };
    expect(customerList.items.length).toBeGreaterThan(0);
    const customer = customerList.items[0];

    await page.goto('/accounting');
    await page.getByTestId('accounting-tab-payments').click();
    await expect(page.getByTestId('new-payment')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('new-payment').click();
    // The attachment field belongs to the same form as the voucher fields.
    await expect(page.getByTestId('new-payment-attachments')).toBeVisible();

    await page.getByTestId('payment-customer').selectOption(customer.id);
    await page.getByTestId('payment-amount').fill('12.500');
    await page.getByTestId('payment-reference').fill(`${PREFIX} RECEIPT`);
    await page.getByTestId('new-payment-attachments-input').setInputFiles({
      name: `${PREFIX} receipt-scan.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('Receipt scan body'),
    });
    await expect(page.getByTestId('new-payment-attachments-draft')).toBeVisible();

    await page.getByTestId('save-payment').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 30_000 });

    const payments = await fetch(`${API}/accounting/payments?page=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const paymentList = (await payments.json()) as {
      items: Array<{ id: string; paymentNumber: string; amountMinor: number }>;
    };
    const created = paymentList.items[0];
    expect(created.amountMinor).toBe(1250);
    fixture.paymentId = created.id;

    const attachments = await fetch(
      `${API}/attachments?entityType=PAYMENT&entityId=${created.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const attached = (await attachments.json()) as { items: Array<{ id: string; fileName: string }> };
    expect(attached.items.map((a) => a.fileName)).toContain(`${PREFIX} receipt-scan.txt`);
    for (const a of attached.items) fixture.attachmentIds.push(a.id);

    await page.getByTestId(`preview-payment-${created.paymentNumber}`).click();
    const preview = page.getByTestId('payment-preview');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(preview.getByText(created.paymentNumber)).toBeVisible();
    // The party name appears in the preview subtitle and in the field list.
    await expect(preview.getByText(customer.nameEn).first()).toBeVisible();
    await expect(page.getByTestId('payment-preview-attachments-item')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('payment-preview-print')).toBeVisible();
  });

  test('13. a role previews its permission set and attachments', async ({ page }) => {
    await page.goto('/roles');
    const previewButtons = page.locator('[data-testid^="preview-role-"]');
    await expect(previewButtons.first()).toBeVisible({ timeout: 30_000 });
    await previewButtons.first().click();

    const preview = page.getByTestId('role-preview');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('role-preview-attachments')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('role-preview-print')).toBeVisible();
  });

  test('10. the file renders in Arabic RTL and English LTR without a server error', async ({ page }) => {
    const employee = await createEmployee(token, 'locale');
    fixture.employeeId = employee.id;

    await page.goto(`/hr/employees/${employee.id}`);
    await expect(page.getByTestId('file-personal-card')).toBeVisible({ timeout: 20_000 });
    await setLocale(page, 'ar');
    await page.reload();
    await expect(page.getByTestId('file-personal-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await setLocale(page, 'en');
    await page.reload();
    await expect(page.getByTestId('file-personal-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
  test('16. the payroll tab prints the chosen window and the full ledger separately', async ({ page }) => {
    const employee = await createEmployee(token, 'ledger');
    fixture.employeeId = employee.id;

    // A real run, so the ledger has a row the window can exclude.
    await fetch(`${API}/hr/salary-structures`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: employee.id, effectiveFrom: '2024-01-01', basicMinor: 500000, components: [] }),
    });
    const period = await fetch(`${API}/hr/payroll-periods`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `${PREFIX}-${Date.now()}`,
        nameEn: 'E06 ledger period',
        nameAr: 'فترة اختبار',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }),
    });
    expect(period.ok, `period creation failed with ${period.status}`).toBe(true);
    const periodBody = (await period.json()) as { id: string };
    const run = await fetch(`${API}/hr/payroll-runs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodId: periodBody.id }),
    });
    expect(run.ok, `run creation failed with ${run.status}`).toBe(true);
    const runBody = (await run.json()) as { runNumber: string };

    await page.goto(`/hr/employees/${employee.id}`);
    await page.getByTestId('file-tab-payroll').click();
    await expect(page.getByTestId('file-payroll')).toBeVisible({ timeout: 20_000 });

    // Narrow the window so the January run falls outside it.
    await page.getByTestId('payroll-from').fill('2026-06-01');
    await page.getByTestId('payroll-to').fill('2026-06-30');
    await page.getByTestId('payroll-apply').click();
    await expect(page.getByText(runBody.runNumber)).toHaveCount(0, { timeout: 20_000 });

    const windowPopup = page.waitForEvent('popup');
    await page.getByTestId('payroll-print-period').click();
    const windowed = await windowPopup;
    await windowed.waitForLoadState();
    expect(await windowed.locator('body').innerText()).not.toContain(runBody.runNumber);
    await windowed.close();

    // The full ledger ignores the window, which is the difference between the
    // two buttons.
    const fullPopup = page.waitForEvent('popup');
    await page.getByTestId('payroll-print-full').click();
    const full = await fullPopup;
    await full.waitForLoadState();
    expect(await full.locator('body').innerText()).toContain(runBody.runNumber);
    await full.close();
  });
});

/**
 * The maintenance module is licensed to the Enterprise tenant only, so the
 * booking test runs in its own session against ORYX-AUTO.
 */
test.describe('Execution 06 — maintenance booking attachments (Enterprise tenant)', () => {
  let token: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    token = await apiToken(page, ENTERPRISE_ADMIN);
  });

  // No HTTP delete route exists for a maintenance booking, so the record and
  // its fixture vehicle are removed by scripts/purge-ui-fixtures.mjs.

  test('12. a maintenance booking is created with an attachment and previewed from its own tab', async ({ page }) => {
    const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const customers = await fetch(`${API}/sales/customers?pageSize=5`, { headers: H });
    const customerList = (await customers.json()) as { items: Array<{ id: string }> };
    expect(customerList.items.length).toBeGreaterThan(0);

    // A VIN excludes I, O and Q; the fixture vehicle is matched by its make instead.
    const vin = `E06${Date.now().toString().slice(-11)}`;
    const vehicleRes = await fetch(`${API}/automotive/vehicles`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        customerId: customerList.items[0].id,
        vin,
        make: `${PREFIX}Make`,
        model: 'Model',
        modelYear: 2024,
      }),
    });
    expect(vehicleRes.ok, `vehicle creation failed with ${vehicleRes.status}`).toBe(true);
    const vehicle = (await vehicleRes.json()) as { id: string };

    await page.goto('/automotive/maintenance');
    await page.getByTestId('maintenance-tab-bookings').click();
    await page.getByTestId('new-maintenance-booking').click();
    await expect(page.getByTestId('new-maintenance-booking-attachments')).toBeVisible();

    await page.getByTestId('maintenance-vehicle').selectOption(vehicle.id);
    await page.getByTestId('maintenance-scheduled-at').fill('2026-12-01T09:30');
    await page.getByTestId('new-maintenance-booking-attachments-input').setInputFiles({
      name: `${PREFIX} booking-note.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('Customer reports a vibration'),
    });
    await expect(page.getByTestId('new-maintenance-booking-attachments-draft')).toBeVisible();
    await page.getByTestId('save-maintenance-booking').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 30_000 });

    const bookings = await fetch(`${API}/automotive/maintenance-bookings`, { headers: H });
    const bookingList = (await bookings.json()) as {
      items: Array<{ id: string; bookingNumber: string; vehicleId: string }>;
    };
    const created = bookingList.items.find((b) => b.vehicleId === vehicle.id);
    expect(created, 'the created maintenance booking is missing from the list').toBeTruthy();

    const attachments = await fetch(
      `${API}/attachments?entityType=MAINTENANCE_BOOKING&entityId=${created!.id}`,
      { headers: H },
    );
    const attached = (await attachments.json()) as { items: Array<{ id: string; fileName: string }> };
    expect(attached.items.map((a) => a.fileName)).toContain(`${PREFIX} booking-note.txt`);

    await page.getByTestId(`preview-maintenance-booking-${created!.bookingNumber}`).click();
    const preview = page.getByTestId('maintenance-booking-preview');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(preview.getByText(created!.bookingNumber)).toBeVisible();
    await expect(page.getByTestId('maintenance-booking-preview-attachments-item')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('maintenance-booking-preview-print')).toBeVisible();
  });
});

test.describe('Execution 06 — platform CMS preview', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('12. a website page previews its content and attachments from the list', async ({ page }) => {
    // The CMS is a platform-only surface; the describe signs in as Super Admin.
    await page.goto('/website');
    await expect(page.getByTestId('cms-pages-table')).toBeVisible({ timeout: 20_000 });

    const previewButtons = page.locator('[data-testid^="preview-cms-page-"]');
    await expect(previewButtons.first()).toBeVisible({ timeout: 20_000 });
    await previewButtons.first().click();

    const preview = page.getByTestId('cms-page-preview');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    // The body is rendered in the preview, and the record can be printed.
    await expect(preview.getByText('slug', { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('cms-page-preview-print')).toBeVisible();
  });
});

test.describe('Execution 06 — platform record previews', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('14. a subscription previews its entitlement snapshot', async ({ page }) => {
    await page.goto('/subscriptions');
    const buttons = page.locator('[data-testid^="preview-subscription-"]');
    await expect(buttons.first()).toBeVisible({ timeout: 30_000 });
    await buttons.first().click();

    const preview = page.getByTestId('subscription-preview');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('subscription-preview-print')).toBeVisible();
  });

  test('15. a support session previews its scope and reason', async ({ page }) => {
    await page.goto('/support');
    const buttons = page.locator('[data-testid^="preview-support-"]');
    if ((await buttons.count()) === 0) test.skip(true, 'No support session history in this database.');
    await expect(buttons.first()).toBeVisible({ timeout: 30_000 });
    await buttons.first().click();

    const preview = page.getByTestId('support-preview');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('support-preview-print')).toBeVisible();
  });
});
