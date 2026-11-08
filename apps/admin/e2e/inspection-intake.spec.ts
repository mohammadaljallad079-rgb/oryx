import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { ENTERPRISE_ADMIN, expectNoServerError, setLocale, setTheme, signIn } from './helpers';

/**
 * Vehicle inspection intake (Phase 1) — admin UI acceptance.
 *
 * Drives the new inspection screen with a real photo of a Bahraini vehicle
 * registration card: the card reader fills the form, a human can correct it,
 * and the inspection is saved against the right vehicle and customer. The
 * fixtures the suite creates are removed afterwards through Prisma so the
 * seeded tenant is left exactly as it was found.
 */

const CARD_IMAGE = path.resolve(__dirname, '../../api/test/fixtures/vehicle-registration-card.png');

// A plate that cannot collide with seeded data, used to find and remove the
// rows this suite creates.
const TEST_PLATE = 'PHASE1-E2E';
const TEST_VIN = 'JTHDA1D20P5125981';

const prisma = new PrismaClient();

async function cleanup(): Promise<void> {
  const vehicles = await prisma.vehicle.findMany({ where: { plateNumber: TEST_PLATE }, select: { id: true } });
  const ids = vehicles.map((v) => v.id);
  if (ids.length === 0) return;
  await prisma.inspectionFinding.deleteMany({ where: { booking: { vehicleId: { in: ids } } } });
  await prisma.inspectionReport.deleteMany({ where: { booking: { vehicleId: { in: ids } } } });
  await prisma.inspectionBooking.deleteMany({ where: { vehicleId: { in: ids } } });
  await prisma.vehicleMileageRecord.deleteMany({ where: { vehicleId: { in: ids } } });
  await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
}

test.describe('vehicle inspection intake', () => {
  test.beforeAll(async () => {
    await cleanup();
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('1. the intake screen opens from the bookings tab', async ({ page }) => {
    await page.goto('/automotive/inspections');
    await expect(page.getByTestId('inspections-page')).toBeVisible();
    await page.getByTestId('inspections-tab-bookings').click();
    await page.getByTestId('new-inspection-intake').click();
    await expect(page.getByTestId('new-inspection-page')).toBeVisible();
    await expectNoServerError(page);
  });

  test('2. a registration card photo fills the vehicle form', async ({ page }) => {
    await page.goto('/automotive/inspections/new');
    await expect(page.getByTestId('new-inspection-page')).toBeVisible();

    await page.getByTestId('intake-card-file').setInputFiles(CARD_IMAGE);
    // The reader runs the real OCR engine, so allow a generous window.
    await expect(page.getByTestId('intake-plate')).toHaveValue('649525', { timeout: 60_000 });
    await expect(page.getByTestId('intake-make')).toHaveValue('Mercedes');
    await expect(page.getByTestId('intake-model')).toHaveValue('E300');
    await expect(page.getByTestId('intake-year')).toHaveValue('2020');
    await expect(page.getByTestId('intake-color')).toHaveValue('Gray');
    await expect(page.getByTestId('intake-vin')).toHaveValue(TEST_VIN);
    await expectNoServerError(page);
  });

  test('3. an inspection is created from the scanned vehicle', async ({ page }) => {
    await page.goto('/automotive/inspections/new');
    await expect(page.getByTestId('new-inspection-page')).toBeVisible();

    // Pick the first real customer so the vehicle has an owner.
    const customer = page.getByTestId('intake-customer');
    const firstCustomer = (await customer.locator('option').nth(1).getAttribute('value')) ?? '';
    expect(firstCustomer, 'a seeded customer is required').not.toBe('');
    await customer.selectOption(firstCustomer);

    await page.getByTestId('intake-card-file').setInputFiles(CARD_IMAGE);
    await expect(page.getByTestId('intake-make')).toHaveValue('Mercedes', { timeout: 60_000 });

    // Correct the plate to the fixture marker so cleanup can find the row, and
    // add a section beyond the default.
    await page.getByTestId('intake-plate').fill(TEST_PLATE);
    await page.getByTestId('intake-section-CHASSIS').check();
    await page.getByTestId('intake-odometer').fill('51000');

    await page.getByTestId('intake-save').click();
    await expect(page.getByTestId('inspection-created')).toBeVisible({ timeout: 30_000 });

    // The booking must exist in the database against the scanned vehicle.
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { plateNumber: TEST_PLATE } });
    expect(vehicle.vin).toBe(TEST_VIN);
    expect(vehicle.mileage).toBe(51000);
    const booking = await prisma.inspectionBooking.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
    expect(booking.inspectionTypes).toEqual(expect.arrayContaining(['PAINT', 'CHASSIS']));
    expect(booking.customerId).toBeTruthy();
    expectNoServerError(page);
  });

  test('4. the intake screen renders in Arabic RTL without a server error', async ({ page }) => {
    await setLocale(page, 'ar');
    await page.goto('/automotive/inspections/new');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('new-inspection-page')).toBeVisible();
    await expectNoServerError(page);
  });
});
