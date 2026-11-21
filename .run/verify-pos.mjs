#!/usr/bin/env node
/**
 * Literal end-to-end verification of the POS section of the brief, against the
 * live API and the real database. Every check performs the actual user action —
 * it reads the till's own catalogue endpoint, filters by a real category, and
 * completes a real cash sale with an over-tender so the change calculation is
 * exercised — and asserts the stored/returned result.
 *
 * Usage: node .run/verify-pos.mjs
 */
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const EMAIL = process.env.EMAIL ?? 'admin@oryx-auto.local';
const PASSWORD = process.env.PASSWORD ?? 'ChangeMe!Oryx2026';

let token = '';
let companyId = '';

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (companyId) headers['x-oryx-company-id'] = companyId;
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, ok: res.ok, body: parsed };
}

const results = [];
function rec(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function main() {
  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  token = login.body?.accessToken;
  companyId = login.body?.companyId ?? login.body?.memberships?.[0]?.companyId;
  rec('login', login.ok && Boolean(token), `company=${companyId}`);
  if (!token) process.exit(1);

  const ctx = await api('/auth/context');
  const branchId = ctx.body?.branches?.[0]?.id;
  const warehouses = await api('/inventory/warehouses?pageSize=5');
  const warehouseId = warehouses.body?.items?.[0]?.id;
  rec('branch and warehouse resolved', Boolean(branchId && warehouseId), `branch=${branchId}`);

  // Ensure a cashier session is open (a branch may only have one).
  const sessions = await api('/sales/cashier-sessions');
  const open = (sessions.body?.items ?? []).find((s) => s.status === 'OPEN' && s.branchId === branchId);
  let sessionId = open?.id;
  if (!sessionId) {
    const created = await api('/sales/cashier-sessions', {
      method: 'POST',
      body: { branchId, warehouseId, openingFloatMinor: 0 },
    });
    sessionId = created.body?.id;
    rec('open cashier session', created.ok && Boolean(sessionId), `${created.status}`);
  } else {
    rec('cashier session already open', true, sessionId);
  }

  // ------------------------------------------------------- product images
  const catalog = await api('/inventory/pos-catalog');
  const items = catalog.body?.items ?? [];
  rec('POS catalogue returns products', catalog.ok && items.length > 0, `${items.length} products`);
  rec(
    'catalogue exposes an imageUrl field per product',
    items.every((p) => 'imageUrl' in p),
    `${items.filter((p) => p.imageUrl).length} with a stored image`,
  );
  rec(
    'catalogue exposes an on-hand figure and stock status',
    items.every((p) => typeof p.onHand === 'number' && ['IN_STOCK', 'LOW', 'OUT'].includes(p.stockStatus)),
    `sample onHand=${items[0]?.onHand} status=${items[0]?.stockStatus}`,
  );

  // ---------------------------------------------------------- categories
  const categories = await api('/inventory/pos-categories');
  const cats = categories.body?.items ?? [];
  rec('POS categories endpoint returns real groupings', categories.ok && cats.length > 0, cats.join(', '));

  if (cats.length > 0) {
    const filtered = await api(`/inventory/pos-catalog?category=${encodeURIComponent(cats[0])}`);
    const fitems = filtered.body?.items ?? [];
    rec(
      `category filter "${cats[0]}" returns only that category`,
      filtered.ok && fitems.length > 0 && fitems.every((p) => p.category === cats[0]),
      `${fitems.length} products`,
    );
  }

  // ---------------------------------------------------- barcode lookup
  const scannable = items.find((p) => p.barcode);
  if (scannable) {
    const byCode = await api(`/inventory/pos-catalog?search=${encodeURIComponent(scannable.barcode)}`);
    const found = (byCode.body?.items ?? []).some((p) => p.sku === scannable.sku);
    rec('barcode search finds the product by its barcode', byCode.ok && found, scannable.barcode);
  } else {
    rec('barcode search', null, 'no product carries a barcode in this tenant');
  }

  // ---------------------------------------------------- cart + sale + change
  const sellable = items.find((p) => p.stockStatus !== 'OUT') ?? items[0];
  if (!sellable) {
    rec('a sellable product exists', false, 'catalogue empty');
  } else {
    // Two units at the listed price, with the product's own tax rate.
    const qty = 2;
    const lineTotal = sellable.salesPriceMinor * qty;
    const tax = Math.round((lineTotal * (sellable.taxRateBp ?? 0)) / 10000);
    const expectedTotal = lineTotal + tax;
    const overTender = expectedTotal + 5000; // a note handed over, expecting change

    const sale = await api('/sales/pos-sales', {
      method: 'POST',
      body: {
        branchId,
        cashierSessionId: sessionId,
        warehouseId,
        paymentMethod: 'CASH',
        paidMinor: overTender,
        lines: [
          {
            productId: sellable.id,
            description: sellable.nameEn,
            quantity: qty * 10000,
            unitPriceMinor: sellable.salesPriceMinor,
            discountPercentBp: 0,
            taxPercentBp: sellable.taxRateBp ?? 0,
          },
        ],
      },
    });
    rec('POS sale is accepted', sale.ok, `${sale.status}`);
    if (sale.ok) {
      const b = sale.body ?? {};
      rec('receipt number is issued', Boolean(b.receiptNumber), b.receiptNumber);
      rec('sale total matches line + tax', b.totalMinor === expectedTotal, `stored=${b.totalMinor} expected=${expectedTotal}`);
      rec('paid amount is stored', b.paidMinor === overTender, `paid=${b.paidMinor}`);
      rec('change is calculated as paid − total', b.changeMinor === overTender - b.totalMinor, `change=${b.changeMinor}`);

      // The receipt is issued on demand through the same document pipeline as
      // every other official document (the UI's "Issue receipt" action). Drive
      // that real path, then assert the document exists and carries a QR token.
      const issued = await api('/documents/issue', {
        method: 'POST',
        body: { type: 'POS_RECEIPT', sourceId: b.id },
      });
      rec('POS receipt can be issued for the sale', issued.ok, `${issued.status}`);
      if (issued.ok) {
        rec('receipt has a document number', Boolean(issued.body?.documentNumber), issued.body?.documentNumber);
        rec('receipt is downloadable (PDF stored)', issued.body?.downloadable === true, `status=${issued.body?.status}`);
        rec('receipt carries a QR verification token', Boolean(issued.body?.verificationToken ?? issued.body?.qrToken), 'present');
        const verify = await api(`/documents/verify/${issued.body.verificationToken ?? issued.body.qrToken ?? ''}`);
        rec('the receipt QR token verifies', verify.ok, `${verify.status}`);
      }
    }
  }

  const failed = results.filter((r) => r.ok === false).length;
  console.log(`\n${results.filter((r) => r.ok === true).length} passed, ${failed} failed, ${results.filter((r) => r.ok === null).length} skipped`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
