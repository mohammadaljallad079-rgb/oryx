/**
 * Capture the twelve acceptance surfaces the handover brief names, over the
 * public HTTPS preview. Each capture is a real signed-in navigation, so a
 * screenshot only exists if the surface actually rendered with its data.
 *
 * Surfaces 8 and 11 (the quotation and the partial inspection) are official
 * PDFs, not routes. They are captured through the document register's preview
 * modal, which loads the *stored* PDF from `GET /documents/:id/file` — the same
 * bytes a download returns. A public unauthenticated link to a tenant document
 * is deliberately not possible; see the acceptance report.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const ADMIN = 'https://work-1-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const CUSTOMER = 'https://work-2-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const OUT = '/workspace/project/oryx/.run/evidence/final-acceptance';
const MANIFEST = '/workspace/project/oryx/docs/audit/pdf-samples/manifest.json';
mkdirSync(OUT, { recursive: true });

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { documents: [] };
const tokenFor = (name) => manifest.documents.find((d) => d.name === name)?.verificationToken;
const numberFor = (name) => manifest.documents.find((d) => d.name === name)?.documentNumber;

const results = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
const page = await ctx.newPage();

async function signIn(base, email, password) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('[data-testid="login-email"]').fill(email);
  await page.locator('[data-testid="login-password"]').fill(password);
  await page
    .locator('form:has([data-testid="login-email"]) button[type="submit"]')
    .first()
    .click();
  await page.waitForURL('**/dashboard', { timeout: 90000 });
  await page.waitForTimeout(1500);
}

/** Select a company in the platform context selector, then wait for reload. */
async function selectCompany(nameFragment) {
  const select = page.locator('[data-testid="context-selector"] select').first();
  await select.waitFor({ timeout: 20000 });
  const option = select.locator('option', { hasText: nameFragment }).first();
  const value = await option.getAttribute('value');
  if (!value) throw new Error(`company option not found: ${nameFragment}`);
  await select.selectOption(value);
  await page.waitForTimeout(2500);
}

async function shot(label, url, selector) {
  const entry = { label, url, ok: false };
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2500);
    if (selector) await page.locator(selector).first().waitFor({ timeout: 20000 });
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();
    entry.chars = text.length;
    entry.title = await page.title();
    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
    entry.ok = text.length > 120;
  } catch (e) {
    entry.error = String(e).slice(0, 160);
  }
  results.push(entry);
  console.log(`${entry.ok ? 'OK  ' : 'FAIL'} ${label} (${entry.chars ?? 0} chars) ${entry.url}`);
}

/**
 * Open the register preview for one document number and screenshot the stored
 * PDF. The register is paginated, so the number is searched for rather than
 * assumed to be on the first page.
 */
async function shotDocumentPreview(label, documentNumber) {
  const entry = { label, url: `${ADMIN}/documents`, ok: false, documentNumber };
  try {
    await page.goto(`${ADMIN}/documents`, { waitUntil: 'networkidle', timeout: 90000 });
    const search = page.getByTestId('register-search');
    await search.waitFor({ timeout: 30000 });
    await search.fill(documentNumber);
    await page.waitForTimeout(2500);
    await page.locator(`[data-testid="register-open-${documentNumber}"]`).first().click();
    await page.locator('[data-testid="register-frame"]').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(3000);
    entry.chars = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().length);
    entry.title = await page.title();
    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
    entry.ok = entry.chars > 120;
  } catch (e) {
    entry.error = String(e).slice(0, 160);
  }
  results.push(entry);
  console.log(`${entry.ok ? 'OK  ' : 'FAIL'} ${label} (${entry.chars ?? 0} chars) ${entry.url}`);
}

await signIn(ADMIN, 'superadmin@oryx.local', 'ChangeMe!Oryx2026');
await selectCompany('ORYX Auto Services');
await shot('01-admin-dashboard', `${ADMIN}/dashboard`, '[data-testid="dashboard-hero"]');
await shot('06-document-register', `${ADMIN}/documents`, '[data-testid="document-register"]');
await shotDocumentPreview('08-quotation', numberFor('quotation.pdf'));
await shotDocumentPreview('11-partial-inspection', numberFor('vehicle-inspection-partial.pdf'));
await shot('05-merchant-interface', `${ADMIN}/providers`, 'main');
await shot('07-sales-invoice', `${ADMIN}/sales`, 'main');
await shot('09-purchase-invoice', `${ADMIN}/purchasing`, 'main');
await shot('10-inspection-engine', `${ADMIN}/automotive/inspections`, 'main');

// Customer surfaces: the session cookie carries across a full navigation.
await signIn(CUSTOMER, 'customer@oryx-demo.local', 'OryxDemo!2026');
await shot('02-customer-website', `${CUSTOMER}/`, 'main');
await shot('03-products', `${CUSTOMER}/products`, 'main');
await shot('04-services', `${CUSTOMER}/services`, 'main');
const verifyToken = tokenFor('quotation.pdf') ?? tokenFor('sales-invoice.pdf');
await shot('12-qr-verification', `${CUSTOMER}/verify/${verifyToken}`, 'main');

writeFileSync(`${OUT}/index.json`, JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\ncaptured ${results.length}, failed ${failed}`);
process.exit(failed ? 1 : 0);
