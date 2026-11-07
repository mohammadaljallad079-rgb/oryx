#!/usr/bin/env node
/**
 * Regenerate the official-document PDF samples from the CURRENT tree.
 *
 * Drives the live API with real seeded data and writes one PDF per issuable
 * official-document type plus the raw JSON the API returned, so every claim in
 * the acceptance report points at an artefact from this revision.
 *
 * It only reads/creates demo rows in the development database and stores the
 * resulting PDFs under docs/audit/pdf-samples/. It never touches production.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const { INSPECTION_SECTION_SPECS } = require(resolve(root, 'packages/shared/dist/index.js'));

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const OUT = resolve(root, 'docs/audit/pdf-samples');
const EMAIL = process.env.EVIDENCE_EMAIL ?? 'admin@oryx-auto.local';
const PASSWORD = process.env.EVIDENCE_PASSWORD ?? 'ChangeMe!Oryx2026';

mkdirSync(OUT, { recursive: true });

let token = '';
let companyId = '';

async function api(path, { method = 'GET', body, company = companyId, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (company) headers['x-oryx-company-id'] = company;
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(parsed).slice(0, 400)}`);
  }
  return parsed;
}

async function login() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const body = await res.json();
  token = body.accessToken;
  companyId =
    body.companyId ?? companyId ?? body.memberships?.[0]?.companyId ?? body.memberships?.[0]?.company?.id;
  if (!companyId) {
    const ctx = await api('/auth/context');
    companyId = ctx.companies?.[0]?.id ?? ctx.memberships?.[0]?.companyId;
  }
  if (!companyId) throw new Error('could not resolve companyId');
  console.log(`signed in as ${EMAIL} (company ${companyId})`);
}

async function firstId(path, pick) {
  const list = await api(path);
  const rows = Array.isArray(list) ? list : list.items ?? list.data ?? [];
  const row = rows.find(pick ?? (() => true));
  if (!row) throw new Error(`no record from ${path}`);
  return row;
}

async function createInspection(customerId, vehicleId, areas, { dense }) {
  const created = await api('/automotive/inspections', {
    method: 'POST',
    body: { customerId, vehicleId, selectedAreas: areas },
  });
  const sessionId = created.id;

  const note = 'ملاحظة تفصيلية على البند تم تسجيلها أثناء الفحص الميداني · detailed finding recorded';
  for (const area of areas) {
    const spec = INSPECTION_SECTION_SPECS.find((s) => s.key === area);
    const body = dense
      ? { noFindings: false, remarks: 'ملاحظات القسم المسجلة أثناء الفحص · section remarks recorded during the inspection' }
      : { noFindings: true };
    if (spec.items.length > 0) {
      body.items = spec.items.map((i, index) =>
        dense
          ? { itemKey: i.key, result: index % 7 === 0 ? 'FAIL' : 'PASS', note: index % 3 === 0 ? note : undefined }
          : { itemKey: i.key, result: 'PASS' },
      );
    }
    await api(`/automotive/inspections/${sessionId}/sections/${area}`, { method: 'PUT', body });

    if (spec.kind === 'DIAGRAM_PAINT') {
      await api(`/automotive/inspections/${sessionId}/paint-markers`, {
        method: 'PUT',
        body: {
          markers: dense
            ? [
                { condition: 'PAINT', x: 0.4, y: 0.3, panelKey: 'frontLeftDoor', note: 'Resprayed' },
                { condition: 'FILLER', x: 0.6, y: 0.5, panelKey: 'rearRightDoor', note: 'Filler detected' },
              ]
            : [{ condition: 'PAINT', x: 0.4, y: 0.3, panelKey: 'frontLeftDoor', note: 'Resprayed' }],
        },
      });
    }
    if (spec.kind === 'DIAGRAM_CHASSIS') {
      await api(`/automotive/inspections/${sessionId}/chassis-regions`, {
        method: 'PUT',
        body: {
          regions: dense
            ? [{ regionKey: 'FRONT', condition: 'OK' }, { regionKey: 'REAR', condition: 'DAMAGE' }]
            : [{ regionKey: 'FRONT', condition: 'OK' }],
        },
      });
    }
    if (spec.kind === 'DIAGNOSTIC' && dense) {
      await api(`/automotive/inspections/${sessionId}/diagnostics`, {
        method: 'POST',
        body: {
          module: 'Engine control unit',
          faultCode: 'P0301',
          description: 'Cylinder 1 misfire detected during the road test',
          observation: 'Intermittent; clears when the engine is warm',
          severity: 'MINOR',
        },
      });
    }
  }

  await api(`/automotive/inspections/${sessionId}`, {
    method: 'PATCH',
    body: { finalAssessment: 'المركبة بحالة جيدة · Vehicle in good condition' },
  });
  await api(`/automotive/inspections/${sessionId}/submit`, { method: 'POST' });
  await api(`/automotive/inspections/${sessionId}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  return sessionId;
}

async function issueInspection(sessionId) {
  return api(`/documents/inspections/${sessionId}/issue`, { method: 'POST' });
}

async function issueFinancial(type, sourceId) {
  return api('/documents/issue', { method: 'POST', body: { type, sourceId } });
}

async function download(documentId) {
  const res = await api(`/documents/${documentId}/file`, { raw: true });
  if (!res.ok) throw new Error(`download ${documentId} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const manifest = { generatedAt: new Date().toISOString(), base: BASE, documents: [] };

async function save(name, doc, extra = {}) {
  const buf = await download(doc.id);
  writeFileSync(resolve(OUT, name), buf);
  manifest.documents.push({
    name,
    type: doc.type,
    documentNumber: doc.documentNumber,
    pageCount: doc.pageCount,
    byteSize: buf.length,
    verificationToken: doc.verificationToken,
    ...extra,
  });
  console.log(
    `wrote ${name.padEnd(34)} ${doc.documentNumber.padEnd(14)} ${String(doc.pageCount).padStart(2)}pp  ${buf.length} bytes`,
  );
}

async function main() {
  await login();
  const customer = await firstId('/sales/customers');
  const vehicle = await firstId('/automotive/vehicles', (v) => v.customerId);
  const vehicleCustomerId = vehicle.customerId ?? customer.id;
  const warehouse = await firstId('/inventory/warehouses');
  const product = await firstId('/inventory/products');
  const supplier = await firstId('/purchasing/suppliers');

  // The sample document flows consume real stock (invoices, POS sales, returns
  // restock), so repeated runs drain the demo product and a later run fails with
  // `inventory.insufficient_stock`. Top the product up through the same
  // adjustment path the UI uses, so the generator is repeatable without a reseed.
  const topUp = await api('/inventory/adjustments', {
    method: 'POST',
    body: {
      warehouseId: warehouse.id,
      reason: 'Evidence sample stock top-up · تعبئة مخزون أدلة',
      lines: [{ productId: product.id, quantityDelta: 500 * 10000 }],
    },
  });
  await api(`/inventory/adjustments/${topUp.id}/post`, { method: 'POST' });
  const accounts = await api('/accounting/accounts?pageSize=200');
  const accountRows = Array.isArray(accounts) ? accounts : accounts.items ?? [];
  const byCode = (code) => accountRows.find((a) => a.code === code);
  const TODAY = new Date().toISOString();

  // --- Full inspection: every selectable area -----------------------------
  const fullAreas = INSPECTION_SECTION_SPECS.map((s) => s.key);
  const fullSession = await createInspection(vehicleCustomerId, vehicle.id, fullAreas, { dense: true });
  await save('vehicle-inspection-full.pdf', await issueInspection(fullSession), { areas: fullAreas });

  // --- Partial inspection: three areas ------------------------------------
  const partialAreas = ['PAINT_BODY', 'ENGINE_COMPARTMENT', 'COMPUTER_UNIT'];
  const partialSession = await createInspection(vehicleCustomerId, vehicle.id, partialAreas, { dense: false });
  await save('vehicle-inspection-partial.pdf', await issueInspection(partialSession), { areas: partialAreas });

  // --- Quotation ----------------------------------------------------------
  const quotation = await api('/sales/quotations', {
    method: 'POST',
    body: {
      customerId: customer.id,
      documentDate: TODAY,
      validUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
      notes: 'الأسعار سارية ٣٠ يوماً · Prices valid for 30 days',
      lines: [
        { productId: product.id, description: product.nameEn ?? 'Genuine spare part', quantity: 2 * 10000, unitPriceMinor: 45000, taxPercentBp: 1000 },
        { description: 'Labour — scheduled maintenance', quantity: 3 * 10000, unitPriceMinor: 12000, discountPercentBp: 500, taxPercentBp: 1000 },
        { description: 'Diagnostic scan and report', quantity: 1 * 10000, unitPriceMinor: 25000, taxPercentBp: 1000 },
      ],
    },
  });
  await save('quotation.pdf', await issueFinancial('QUOTATION', quotation.id));

  // --- Sales order --------------------------------------------------------
  const order = await api('/sales/orders', {
    method: 'POST',
    body: {
      customerId: customer.id,
      warehouseId: warehouse.id,
      documentDate: TODAY,
      confirm: true,
      lines: [
        { productId: product.id, description: product.nameEn ?? 'Genuine spare part', quantity: 1 * 10000, unitPriceMinor: 45000, taxPercentBp: 1000 },
      ],
    },
  });
  await save('sales-order.pdf', await issueFinancial('SALES_ORDER', order.id));

  // --- Sales invoice ------------------------------------------------------
  const invoice = await api('/sales/invoices', {
    method: 'POST',
    body: {
      customerId: customer.id,
      warehouseId: warehouse.id,
      documentDate: TODAY,
      notes: 'شكراً لتعاملكم معنا · Thank you for your business',
      lines: [
        { productId: product.id, description: product.nameEn ?? 'Genuine spare part', quantity: 2 * 10000, unitPriceMinor: 45000, taxPercentBp: 1000 },
        { description: 'Labour — scheduled maintenance', quantity: 3 * 10000, unitPriceMinor: 12000, discountPercentBp: 500, taxPercentBp: 1000 },
      ],
    },
  });
  await save('sales-invoice.pdf', await issueFinancial('SALES_INVOICE', invoice.id));

  // --- Sales return (credit note) -----------------------------------------
  const creditNote = await api('/sales/credit-notes', {
    method: 'POST',
    body: {
      customerId: customer.id,
      warehouseId: warehouse.id,
      documentDate: TODAY,
      reason: 'عميل أعاد القطعة · customer returned the part',
      restockInventory: true,
      lines: [
        { productId: product.id, description: product.nameEn ?? 'Returned spare part', quantity: 1 * 10000, unitPriceMinor: 45000, taxPercentBp: 1000 },
      ],
    },
  });
  await save('sales-return.pdf', await issueFinancial('SALES_RETURN', creditNote.id));

  // --- Purchase order -----------------------------------------------------
  const purchaseOrder = await api('/purchasing/orders', {
    method: 'POST',
    body: {
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      orderDate: TODAY,
      expectedDate: new Date(Date.now() + 14 * 864e5).toISOString(),
      approve: true,
      notes: 'توريد قطع غيار أصلية · genuine parts supply',
      lines: [
        { productId: product.id, description: product.nameEn ?? 'Genuine spare part', quantity: 4 * 10000, unitCostMinor: 30000, taxPercentBp: 1000 },
        { description: 'Freight and handling', quantity: 1 * 10000, unitCostMinor: 15000, taxPercentBp: 1000 },
      ],
    },
  });
  await save('purchase-order.pdf', await issueFinancial('PURCHASE_ORDER', purchaseOrder.id));

  // --- Purchase invoice (supplier invoice) --------------------------------
  const supplierInvoice = await api('/purchasing/supplier-invoices', {
    method: 'POST',
    body: {
      supplierId: supplier.id,
      supplierInvoiceNumber: `VENDOR-${Date.now().toString().slice(-6)}`,
      invoiceDate: TODAY,
      dueDate: new Date(Date.now() + 30 * 864e5).toISOString(),
      post: true,
      notes: 'مشتريات شهرية · monthly purchase',
      lines: [
        { productId: product.id, description: product.nameEn ?? 'Genuine spare part', quantity: 6 * 10000, unitCostMinor: 30000, taxPercentBp: 1000 },
      ],
    },
  });
  await save('purchase-invoice.pdf', await issueFinancial('PURCHASE_INVOICE', supplierInvoice.id));

  // --- Purchase return ----------------------------------------------------
  const purchaseReturn = await api('/purchasing/returns', {
    method: 'POST',
    body: {
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      returnDate: TODAY,
      reason: 'بضاعة تالفة · damaged goods',
      lines: [
        { productId: product.id, description: product.nameEn ?? 'Returned spare part', quantity: 1 * 10000, unitCostMinor: 30000, taxPercentBp: 1000 },
      ],
    },
  });
  await save('purchase-return.pdf', await issueFinancial('PURCHASE_RETURN', purchaseReturn.id));

  // --- Payment receipt (customer receipt) ---------------------------------
  const receipt = await api('/accounting/payments', {
    method: 'POST',
    body: {
      direction: 'RECEIPT',
      partyType: 'CUSTOMER',
      customerId: customer.id,
      method: 'CASH',
      amountMinor: 50000,
      paidAt: TODAY,
      reference: 'RCPT-DEMO-1',
      notes: 'دفعة نقدية من العميل · cash received from customer',
    },
  });
  await save('payment-receipt.pdf', await issueFinancial('PAYMENT_RECEIPT', receipt.id));

  // --- Payment voucher (supplier payment) ---------------------------------
  const voucher = await api('/accounting/payments', {
    method: 'POST',
    body: {
      direction: 'PAYMENT',
      partyType: 'SUPPLIER',
      supplierId: supplier.id,
      method: 'BANK_TRANSFER',
      amountMinor: 75000,
      paidAt: TODAY,
      reference: 'VCHR-DEMO-1',
      notes: 'حوالة بنكية للمورد · bank transfer to supplier',
    },
  });
  await save('payment-voucher.pdf', await issueFinancial('PAYMENT_VOUCHER', voucher.id));

  // --- Customer statement -------------------------------------------------
  await save('customer-statement.pdf', await issueFinancial('CUSTOMER_STATEMENT', customer.id));

  // --- Supplier statement -------------------------------------------------
  await save('supplier-statement.pdf', await issueFinancial('SUPPLIER_STATEMENT', supplier.id));

  // --- Journal entry ------------------------------------------------------
  const cash = byCode('1000') ?? accountRows[0];
  const revenue = byCode('4000') ?? accountRows[1];
  const journal = await api('/accounting/journals', {
    method: 'POST',
    body: {
      entryDate: TODAY,
      memo: 'قيد افتتاحي تجريبي · demo opening entry',
      lines: [
        { accountId: cash.id, debitMinor: 100000, description: 'Opening cash' },
        { accountId: revenue.id, creditMinor: 100000, description: 'Opening revenue offset' },
      ],
    },
  });
  await save('journal-entry.pdf', await issueFinancial('JOURNAL_ENTRY', journal.id));

  // --- POS receipt (the till slip) ----------------------------------------
  // A POS receipt is issued from a settled POS sale, so the sample is created
  // the way the terminal does it: open a cashier session, record the sale, then
  // issue the receipt against the sale id.
  const branch = await firstId(`/companies/${companyId}/branches`);
  // A failed earlier run can leave a session open (the branch allows only one),
  // so reuse it rather than opening a second one, which the API refuses.
  const sessions = await api('/sales/cashier-sessions');
  const openSession = (sessions.items ?? []).find((s) => s.status === 'OPEN' && s.branchId === branch.id);
  const session = openSession ?? (await api('/sales/cashier-sessions', {
    method: 'POST',
    body: { branchId: branch.id, openingFloatMinor: 100000 },
  }));
  const posSale = await api('/sales/pos-sales', {
    method: 'POST',
    body: {
      branchId: branch.id,
      cashierSessionId: session.id,
      warehouseId: warehouse.id,
      customerId: customer.id,
      paymentMethod: 'CASH',
      lines: [
        { productId: product.id, description: product.nameEn ?? 'Spare part', quantity: 2 * 10000, unitPriceMinor: 45000, taxPercentBp: 1000, discountPercentBp: 500 },
      ],
    },
  });
  await save('pos-receipt.pdf', await issueFinancial('POS_RECEIPT', posSale.id));
  await api(`/sales/cashier-sessions/${session.id}/close`, {
    method: 'POST',
    body: { countedCashMinor: 0 },
  }).catch(() => {});

  writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n${manifest.documents.length} documents written; manifest updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
