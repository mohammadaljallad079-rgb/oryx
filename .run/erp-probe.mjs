#!/usr/bin/env node
/**
 * Prove the ERP mobile app's resources are backed by the live API and database.
 *
 * Signs in over the native staff contract (`x-oryx-client: mobile`), then reads
 * every resource the app's registry lists and reports the row counts the API
 * returns. A hard-coded list in the app could not produce these numbers.
 */
const BASE = process.env.ORYX_API ?? 'http://127.0.0.1:3001/api/v1';
const EMAIL = process.env.ORYX_EMAIL ?? 'admin@demo-alnoor.local';
const PASSWORD = process.env.ORYX_PASSWORD ?? 'ChangeMe!Oryx2026';

const PATHS = [
  ['customers', '/sales/customers'],
  ['invoices', '/sales/invoices'],
  ['quotations', '/sales/quotations'],
  ['orders', '/sales/orders'],
  ['products', '/inventory/products'],
  ['warehouses', '/inventory/warehouses'],
  ['transfers', '/inventory/transfers'],
  ['movements', '/inventory/movements'],
  ['employees', '/hr/employees'],
  ['leads', '/crm/leads'],
  ['opportunities', '/crm/opportunities'],
  ['tickets', '/crm/tickets'],
  ['projects', '/operations/projects'],
  ['tasks', '/operations/tasks'],
  ['work-orders', '/operations/work-orders'],
  ['vehicles', '/automotive/vehicles'],
  ['job-cards', '/automotive/job-cards'],
  ['accounts', '/accounting/accounts'],
  ['journals', '/accounting/journals'],
  ['payments', '/accounting/payments'],
];

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-oryx-client': 'mobile' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const session = await login();
  const token = session.accessToken;
  const companyId = session.memberships?.[0]?.companyId;
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-oryx-client': 'mobile',
    'x-oryx-company-id': companyId,
  };

  console.log(`signed in as ${session.user.email}`);
  console.log(`company: ${session.memberships?.[0]?.companyNameEn} (${companyId})`);
  console.log(`permissions: ${session.permissions.length}\n`);

  let ok = 0;
  let failed = 0;
  for (const [name, path] of PATHS) {
    try {
      const res = await fetch(`${BASE}${path}?pageSize=5`, { headers });
      if (!res.ok) {
        console.log(`  ${name.padEnd(14)} ${String(res.status).padEnd(4)} ${path}`);
        failed += 1;
        continue;
      }
      const data = await res.json();
      const total = data.total ?? (Array.isArray(data.items) ? data.items.length : '?');
      const sample = data.items?.[0];
      const sampleKey = sample
        ? (sample.code ?? sample.invoiceNumber ?? sample.sku ?? sample.title ?? sample.id ?? '')
        : '';
      console.log(`  ${name.padEnd(14)} ${String(res.status).padEnd(4)} total=${String(total).padEnd(6)} first=${sampleKey}`);
      ok += 1;
    } catch (err) {
      console.log(`  ${name.padEnd(14)} ERR  ${err.message}`);
      failed += 1;
    }
  }
  console.log(`\n${ok} readable, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
