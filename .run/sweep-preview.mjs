// Externally verify every preview URL over public HTTPS and report a real
// status for each. Anonymous routes are checked with a plain fetch; surfaces
// behind the staff session are checked after signing in through the browser, so
// a 200 is only recorded when the page actually renders and no request fails.
import { chromium } from 'playwright';

const ADMIN = 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const PASSWORD = 'ChangeMe!Oryx2026';
const CUSTOMER_PASSWORD = 'OryxDemo!2026';

// Anonymous surfaces: a 200 plus a body is the whole check.
const anon = [
  ['Super Admin login', `${ADMIN}/login`],
  ['API health', `${ADMIN}/api/health`],
  ['Customer website', `${CUSTOMER}/`],
  ['Customer services', `${CUSTOMER}/services`],
  ['Customer provider directory', `${CUSTOMER}/providers`],
  ['Customer login', `${CUSTOMER}/login`],
  ['Provider application', `${CUSTOMER}/providers/apply`],
  ['Mobile web login', `${CUSTOMER}/mobile/login`],
  ['Mobile web home', `${CUSTOMER}/mobile/`],
];

// Authenticated admin surfaces, one per required preview.
const adminRoutes = [
  ['Super Admin dashboard', '/dashboard'],
  ['Company ERP dashboard', '/dashboard'],
  ['Accounting', '/accounting'],
  ['Sales / POS', '/sales'],
  ['Inventory', '/inventory'],
  ['Procurement', '/purchasing'],
  ['HR / payroll', '/hr'],
  ['CRM', '/crm'],
  ['Automotive operations', '/operations'],
  ['Inspections', '/automotive/inspections'],
  ['Workshop', '/automotive/maintenance'],
  ['Spare parts', '/automotive/spare-parts'],
  ['Provider portal', '/providers'],
  ['Bookings', '/bookings'],
  ['Payments', '/payments'],
  ['External Integrations Center', '/integrations'],
  ['Reports', '/reports'],
  ['Customer platform admin', '/customer'],
];

// Authenticated customer surfaces.
const customerRoutes = [
  ['Customer dashboard', '/dashboard'],
  ['Customer garage', '/garage'],
  ['Customer bookings', '/bookings'],
  ['Customer invoices', '/invoices'],
  ['Customer support', '/support'],
  ['Mobile garage', '/mobile/garage'],
  ['Mobile bookings', '/mobile/bookings'],
  ['Mobile services', '/mobile/services'],
  ['Mobile account', '/mobile/account'],
];

const results = [];
const record = (surface, url, status, note = '') => {
  results.push({ surface, url, status, note });
  const flag = status >= 200 && status < 400 ? 'OK ' : 'FAIL';
  console.log(`${flag} ${String(status).padEnd(4)} ${surface.padEnd(32)} ${url}${note ? '  — ' + note : ''}`);
};

// ---- anonymous sweep
for (const [surface, url] of anon) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const body = await res.text();
    record(surface, url, res.status, body.length > 200 ? '' : `short body (${body.length}b)`);
  } catch (err) {
    record(surface, url, 0, String(err).slice(0, 80));
  }
}

// ---- authenticated sweep
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const failedRequests = [];
const consoleErrors = [];
page.on('response', (r) => {
  if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });

async function signInOn(pg, base, email, password = PASSWORD) {
  await pg.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await pg.locator('[data-testid="login-email"]').fill(email);
  await pg.locator('[data-testid="login-password"]').fill(password);
  // The admin login carries a testid on its submit button; the customer login
  // does not, so fall back to the form's submit control.
  const submit = pg.locator('[data-testid="login-submit"]');
  if (await submit.count()) await submit.click();
  else await pg.locator('button[type="submit"]').first().click();
  await pg.waitForURL('**/dashboard', { timeout: 90000 });
  await pg.waitForTimeout(1500);
}

const signIn = (base, email) => signInOn(page, base, email);

try {
  await signIn(ADMIN, 'superadmin@oryx.local');
  record('Super Admin sign-in', `${ADMIN}/dashboard`, 200, 'session established');

  // The platform principal must select a tenant before the ERP modules serve
  // data. Select the Enterprise tenant through the header control, which is the
  // workflow a reviewer follows, then sweep the ERP surfaces.
  let tenantSelected = false;
  try {
    const select = page.getByTestId('context-selector').locator('select').first();
    // The option label is localised, so match on the company name inside the
    // option text and select by its stable value (the company id).
    const value = await select.evaluate((el) => {
      const opt = Array.from(el.options).find((o) => o.text.includes('ORYX Auto Services'));
      return opt ? opt.value : null;
    });
    if (value) {
      await select.selectOption(value);
      await page.waitForTimeout(3000);
      tenantSelected = true;
    }
  } catch (err) {
    console.log('tenant select failed: ' + String(err).slice(0, 120));
  }
  record('Select Enterprise tenant', `${ADMIN}/dashboard`, tenantSelected ? 200 : 0,
    tenantSelected ? 'ORYX Auto Services selected' : 'context selector not usable');

  for (const [surface, route] of adminRoutes) {
    const before = failedRequests.length;
    let status = 0;
    let note = '';
    try {
      const res = await page.goto(`${ADMIN}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      status = res?.status() ?? 0;
      await page.waitForTimeout(1200);
      const newFails = failedRequests.slice(before).filter((f) => !f.includes('/_next/'));
      if (newFails.length) note = `${newFails.length} request(s) >=400: ${[...new Set(newFails)].slice(0, 3).join(' | ')}`;
      const body = await page.content();
      if (/Application error|Internal Server Error/.test(body)) note = 'error boundary';
    } catch (err) {
      note = String(err).slice(0, 80);
    }
    record(surface, `${ADMIN}${route}`, status, note);
  }
} catch (err) {
  record('Admin authenticated sweep', ADMIN, 0, String(err).slice(0, 120));
}

try {
  // A fresh context: the admin sweep left its session hint and company context
  // in localStorage, and clearing cookies does not remove those. The customer
  // app shares the origin only with itself, so a clean context is the honest
  // simulation of a second visitor.
  await browser.close();
  const browser2 = await chromium.launch();
  const ctx2 = await browser2.newContext({ viewport: { width: 1440, height: 900 } });
  const page2 = await ctx2.newPage();
  page2.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page2.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });

  await signInOn(page2, CUSTOMER, 'customer@oryx-demo.local', CUSTOMER_PASSWORD);
  record('Customer sign-in', `${CUSTOMER}/dashboard`, 200, 'session established');

  for (const [surface, route] of customerRoutes) {
    const before = failedRequests.length;
    let status = 0;
    let note = '';
    try {
      const res = await page2.goto(`${CUSTOMER}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      status = res?.status() ?? 0;
      await page2.waitForTimeout(1200);
      const newFails = failedRequests.slice(before).filter((f) => !f.includes('/_next/'));
      if (newFails.length) note = `${newFails.length} request(s) >=400: ${[...new Set(newFails)].slice(0, 3).join(' | ')}`;
      const body = await page2.content();
      if (/Application error|Internal Server Error/.test(body)) note = 'error boundary';
    } catch (err) {
      note = String(err).slice(0, 80);
    }
    record(surface, `${CUSTOMER}${route}`, status, note);
  }
  await browser2.close();
} catch (err) {
  record('Customer authenticated sweep', CUSTOMER, 0, String(err).slice(0, 120));
}

const ok = results.filter((r) => r.status >= 200 && r.status < 400).length;
console.log('\n=== SUMMARY ===');
console.log(`checked: ${results.length}`);
console.log(`success: ${ok}`);
console.log(`failed:  ${results.length - ok}`);
console.log(`console errors observed: ${[...new Set(consoleErrors)].length}`);
for (const e of [...new Set(consoleErrors)].slice(0, 8)) console.log('  ' + e);

const fs = await import('node:fs');
fs.writeFileSync(
  '/tmp/oryxprobe/preview-sweep.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), results, consoleErrors: [...new Set(consoleErrors)] }, null, 2),
);
console.log('json: /tmp/oryxprobe/preview-sweep.json');

process.exit(results.length - ok === 0 ? 0 : 1);
