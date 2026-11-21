#!/usr/bin/env node
/**
 * Stock transfer round trip through the ERP mobile app's contract.
 *
 * Creates a second warehouse, receives stock into the first, then transfers
 * between them and posts it. Posting is the only path that moves stock, so the
 * assertions check the on-hand level on both sides afterwards — read back from
 * the API, not from the app's own state.
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
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data?.message ?? data)}`);
    return data;
  };
}

async function main() {
  const session = await login();
  const companyId = session.memberships[0].companyId;
  const call = makeClient(session.accessToken, companyId);
  const out = [];

  // Two warehouses to move between.
  const from = await call('POST', '/inventory/warehouses', {
    code: `ERP-PROBE-W1-${STAMP}`,
    nameEn: `Probe Warehouse 1 ${STAMP}`,
    nameAr: `مخزن فحص 1 ${STAMP}`,
  });
  const to = await call('POST', '/inventory/warehouses', {
    code: `ERP-PROBE-W2-${STAMP}`,
    nameEn: `Probe Warehouse 2 ${STAMP}`,
    nameAr: `مخزن فحص 2 ${STAMP}`,
  });
  out.push(['warehouse A', `${from.code} ${from.id.slice(-6)}`]);
  out.push(['warehouse B', `${to.code} ${to.id.slice(-6)}`]);

  // A product to move.
  const product = await call('POST', '/inventory/products', {
    sku: `ERP-PROBE-T-${STAMP}`,
    nameEn: `Probe Transfer Item ${STAMP}`,
    nameAr: `صنف نقل ${STAMP}`,
    type: 'PRODUCT',
    unit: 'EA',
    salesPriceMinor: 5000,
    costPriceMinor: 3000,
    reorderLevel: 0,
  });
  out.push(['product', product.sku]);

  // Receive 100 units into warehouse A so there is something to move.
  await call('POST', '/inventory/movements', {
    warehouseId: from.id,
    productId: product.id,
    direction: 'IN',
    quantity: 1000000,
    unitCostMinor: 3000,
    memo: `ERP-PROBE-${STAMP}`,
    occurredAt: new Date().toISOString(),
  });
  out.push(['received into A', '100 units']);

  const level = async (warehouseId) => {
    const res = await call('GET', `/inventory/valuation?companyId=${companyId}`);
    const row = (res.rows ?? []).find(
      (l) => l.productId === product.id && l.warehouseId === warehouseId,
    );
    return row ? Number(row.quantity) / 10000 : 0;
  };

  out.push(['A on hand before', await level(from.id)]);
  out.push(['B on hand before', await level(to.id)]);

  // Create and post the transfer — the app's two-call sequence.
  const transfer = await call('POST', '/inventory/transfers', {
    fromWarehouseId: from.id,
    toWarehouseId: to.id,
    notes: `ERP mobile probe ${STAMP}`,
    lines: [{ productId: product.id, quantity: 400000 }],
  });
  out.push(['transfer created', transfer.transferNumber ?? transfer.id]);

  const posted = await call('POST', `/inventory/transfers/${transfer.id}/post`, {});
  out.push(['transfer posted', `${posted.transferNumber ?? posted.id} status=${posted.status}`]);

  out.push(['A on hand after', await level(from.id)]);
  out.push(['B on hand after', await level(to.id)]);

  // The transfer must have moved 40 units A -> B.
  const aAfter = await level(from.id);
  const bAfter = await level(to.id);
  const moved = aAfter === 60 && bAfter === 40;

  console.log(`company: ${session.memberships[0].companyNameEn}\nstamp: ${STAMP}\n`);
  for (const [label, value] of out) console.log(`  ${label.padEnd(20)} ${value}`);
  console.log(`\nstock moved A 100 -> 60 and B 0 -> 40: ${moved ? 'PASS' : 'FAIL'}`);
  if (!moved) process.exit(1);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
