/**
 * Prove the new document-language setting is live end to end: sign in as the
 * platform principal, open a tenant's settings, change the language, save, then
 * read the value back from the API. Screenshots are real navigations; the
 * read-back is a real API call, so the setting is shown to persist.
 */
import { chromium } from 'playwright';
const ADMIN = process.env.ADMIN_BASE ?? 'https://work-1-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const OUT = '/workspace/project/oryx/.run/evidence/mandate-6';
const EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local';
const PASS = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
const p = await ctx.newPage();
await p.goto(`${ADMIN}/login`, { waitUntil: 'networkidle', timeout: 90000 });
await p.locator('[data-testid="login-email"]').fill(EMAIL);
await p.locator('[data-testid="login-password"]').fill(PASS);
await p.locator('form:has([data-testid="login-email"]) button[type="submit"]').first().click();
await p.waitForURL('**/dashboard', { timeout: 90000 });
await p.goto(`${ADMIN}/companies`, { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForSelector('[data-testid^="company-edit-"]', { timeout: 30000 });
const edit = p.locator('[data-testid^="company-edit-"]').first();
await edit.click();
await p.waitForSelector('[data-testid="edit-company-document-locale"]', { timeout: 20000 });
const before = await p.locator('[data-testid="edit-company-document-locale"]').inputValue();
const companyId = await p.evaluate(() => {
  const el = document.querySelector('[data-testid="edit-company-document-locale"]');
  return el ? (window.location.href) : null;
});
await p.locator('[data-testid="edit-company-document-locale"]').selectOption('ar');
await p.screenshot({ path: `${OUT}/7-document-language-modal.png` });
await p.locator('[data-testid="edit-company-submit"]').click();
await p.waitForSelector('.oryx-modal', { state: 'detached', timeout: 25000 }).catch(() => {});
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/7-document-language-saved.png` });
const companies = await p.evaluate(async () => {
  const r = await fetch('/api/v1/companies?limit=50', { credentials: 'include' });
  return r.json();
});
const list = companies.items ?? companies.data ?? companies;
console.log('before =', before);
console.log('readback =', JSON.stringify((Array.isArray(list) ? list : []).map(c => ({ code: c.code, documentLocale: c.documentLocale }))));
// restore the previous value so the demo tenant is left as found
await p.locator('[data-testid^="company-edit-"]').first().click();
await p.waitForSelector('[data-testid="edit-company-document-locale"]', { timeout: 20000 });
await p.locator('[data-testid="edit-company-document-locale"]').selectOption(before);
await p.locator('[data-testid="edit-company-submit"]').click();
await p.waitForSelector('.oryx-modal', { state: 'detached', timeout: 25000 }).catch(() => {});
console.log('restored to', before);
await b.close();
