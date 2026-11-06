#!/usr/bin/env node
/**
 * Regenerate the official-document PDF samples from the CURRENT tree.
 *
 * The committed samples in `docs/audit/pdf-samples/` were produced before the
 * inspection-mark and font-stack fixes (`de85190f`, `e0b02557`), so they are
 * stale evidence. This script drives the live API with real seeded data and
 * writes fresh PDFs plus the raw JSON the API returned, so every claim in the
 * acceptance report points at an artefact from this revision.
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

function save(name, buf) {
  const path = resolve(OUT, name);
  writeFileSync(path, buf);
  console.log(`wrote ${name} (${buf.length} bytes)`);
}

async function main() {
  await login();
  const customer = await firstId('/sales/customers');
  const vehicle = await firstId('/automotive/vehicles', (v) => v.customerId);
  const vehicleCustomerId = vehicle.customerId ?? customer.id;
  const warehouse = await firstId('/inventory/warehouses');
  const product = await firstId('/inventory/products');
  const TODAY = new Date().toISOString();
  const manifest = { generatedAt: new Date().toISOString(), base: BASE, documents: [] };

  // --- Full inspection: every selectable area -----------------------------
  const fullAreas = INSPECTION_SECTION_SPECS.map((s) => s.key);
  const fullSession = await createInspection(vehicleCustomerId, vehicle.id, fullAreas, { dense: true });
  const fullDoc = await issueInspection(fullSession);
  save('vehicle-inspection-full.pdf', await download(fullDoc.id));
  manifest.documents.push({ name: 'vehicle-inspection-full.pdf', type: fullDoc.type, documentNumber: fullDoc.documentNumber, pageCount: fullDoc.pageCount, byteSize: fullDoc.byteSize, verificationToken: fullDoc.verificationToken, areas: fullAreas });

  // --- Partial inspection: three areas ------------------------------------
  const partialAreas = ['PAINT_BODY', 'ENGINE_COMPARTMENT', 'COMPUTER_UNIT'];
  const partialSession = await createInspection(vehicleCustomerId, vehicle.id, partialAreas, { dense: false });
  const partialDoc = await issueInspection(partialSession);
  save('vehicle-inspection-partial.pdf', await download(partialDoc.id));
  manifest.documents.push({ name: 'vehicle-inspection-partial.pdf', type: partialDoc.type, documentNumber: partialDoc.documentNumber, pageCount: partialDoc.pageCount, byteSize: partialDoc.byteSize, verificationToken: partialDoc.verificationToken, areas: partialAreas });

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
  const quotationDoc = await issueFinancial('QUOTATION', quotation.id);
  save('quotation.pdf', await download(quotationDoc.id));
  manifest.documents.push({ name: 'quotation.pdf', type: quotationDoc.type, documentNumber: quotationDoc.documentNumber, pageCount: quotationDoc.pageCount, byteSize: quotationDoc.byteSize, verificationToken: quotationDoc.verificationToken });

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
  const invoiceDoc = await issueFinancial('SALES_INVOICE', invoice.id);
  save('sales-invoice.pdf', await download(invoiceDoc.id));
  manifest.documents.push({ name: 'sales-invoice.pdf', type: invoiceDoc.type, documentNumber: invoiceDoc.documentNumber, pageCount: invoiceDoc.pageCount, byteSize: invoiceDoc.byteSize, verificationToken: invoiceDoc.verificationToken });

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
  const orderDoc = await issueFinancial('SALES_ORDER', order.id);
  save('sales-order.pdf', await download(orderDoc.id));
  manifest.documents.push({ name: 'sales-order.pdf', type: orderDoc.type, documentNumber: orderDoc.documentNumber, pageCount: orderDoc.pageCount, byteSize: orderDoc.byteSize, verificationToken: orderDoc.verificationToken });

  writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\nmanifest:');
  for (const d of manifest.documents) {
    console.log(`  ${d.name.padEnd(34)} ${d.documentNumber.padEnd(16)} ${String(d.pageCount).padStart(2)}pp  ${d.byteSize} bytes`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
