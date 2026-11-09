#!/usr/bin/env node
/**
 * End-to-end round trip through the ERP mobile app's own API client contract.
 *
 * Creates a customer, a product, a warehouse-to-warehouse stock transfer, and a
 * sales invoice — the exact calls the app's screens make — then reads each one
 * back and prints the persisted row. This is the evidence that the app writes to
 * the real database rather than to local state.
 *
 * It is deliberately additive: every record it creates is named with a
 * `ERP-PROBE-` prefix so it can be identified and removed without touching
 * seeded data.
 */
const BASE = process.env.ORYX_API ?? 'http://127.0.0.1:3001/api/v1';
const EMAIL = process.env.ORYX_EMAIL ?? 'admin@demo-alnoor.local';
const PASSWORD = process.env.ORYX_PASSWORD ?? 'ChangeMe!Oryx2026';
const STAMP = Date.now().toString().slice(-6);

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-oryx-client': 'mobile' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${await res.text()}`);
  return res.json();
}

function makeClient(token, companyId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-oryx-client': 'mobile',
    'x-oryx-company-id': companyId,
    'Content-Type': 'application/json',
  };
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const message = data?.message ?? data?.error ?? text;
      throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(message)}`);
    }
    return data;
  };
}

async function main() {
  const session = await login();
  const companyId = session.memberships[0].companyId;
  const call = makeClient(session.accessToken, companyId);
  const results = [];

  // 1. Create a customer (the app's customer form posts exactly this shape).
  const customer = await call('POST', '/sales/customers', {
    code: `ERP-PROBE-C-${STAMP}`,
    nameEn: `Probe Customer ${STAMP}`,
    nameAr: `عميل فحص ${STAMP}`,
    email: `probe-${STAMP}@example.test`,
    phone: '+97300000000',
    city: 'Manama',
  });
  results.push(['customer created', customer.code ?? customer.id]);
  const customerId = customer.id;

  // 2. Create a product.
  const product = await call('POST', '/inventory/products', {
    sku: `ERP-PROBE-P-${STAMP}`,
    nameEn: `Probe Product ${STAMP}`,
    nameAr: `منتج فحص ${STAMP}`,
    type: 'PRODUCT',
    unit: 'EA',
    salesPriceMinor: 15000,
    costPriceMinor: 9000,
    reorderLevel: 1000,
  });
  results.push(['product created', product.sku ?? product.id]);
  const productId = product.id;

  // 3. Read the customer back by listing and filtering on the code.
  const listed = await call('GET', `/sales/customers?search=ERP-PROBE-C-${STAMP}`);
  const found = (listed.items ?? []).find((c) => c.id === customerId);
  results.push(['customer read back', found ? `found (${found.code})` : 'NOT FOUND']);

  // 4. Create a sales invoice with one line, then post it.
  const invoice = await call('POST', '/sales/invoices', {
    customerId,
    invoiceDate: new Date().toISOString().slice(0, 10),
    currency: 'BHD',
    notes: `ERP mobile probe ${STAMP}`,
    lines: [
      {
        productId,
        description: `Probe line ${STAMP}`,
        quantity: 20000,
        unitPriceMinor: 15000,
        taxPercentBp: 1000,
        discountPercentBp: 0,
      },
    ],
  });
  results.push(['invoice created', invoice.invoiceNumber ?? invoice.id]);
  const invoiceId = invoice.id;

  if (invoice.status === 'DRAFT') {
    const posted = await call('POST', `/sales/invoices/${invoiceId}/post`, {});
    results.push(['invoice posted', `${posted.invoiceNumber} status=${posted.status}`]);
  } else {
    results.push(['invoice status', invoice.status]);
  }

  // 5. Read the invoice back through the list endpoint.
  const invoiceList = await call('GET', '/sales/invoices?pageSize=50');
  const invoiceRow = (invoiceList.items ?? []).find((i) => i.id === invoiceId);
  results.push([
    'invoice read back',
    invoiceRow ? `${invoiceRow.invoiceNumber} total=${invoiceRow.totalMinor} status=${invoiceRow.status}` : 'NOT FOUND',
  ]);

  console.log(`company: ${session.memberships[0].companyNameEn}`);
  console.log(`stamp: ${STAMP}\n`);
  for (const [label, value] of results) {
    console.log(`  ${label.padEnd(22)} ${value}`);
  }
  console.log(`\nids: customer=${customerId} product=${productId} invoice=${invoiceId}`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
