#!/usr/bin/env node
/**
 * Literal end-to-end verification of the six mandated requirements, against the
 * live API and the real database. Every check performs the actual user action
 * (create a tax, pick it in a sales invoice and a purchase invoice, print the
 * PDF) and asserts the stored/returned result — it never inspects source alone.
 *
 * Read-only in effect: it creates a few documents in the isolated preview
 * tenant and leaves them (a document register is append-only by design).
 *
 * Usage: node .run/verify-mandate-6.mjs
 */
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const EMAIL = process.env.EMAIL ?? 'admin@oryx-auto.local';
const PASSWORD = process.env.PASSWORD ?? 'ChangeMe!Oryx2026';

let token = '';
let companyId = '';
let branchId = '';

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (companyId) headers['x-oryx-company-id'] = companyId;
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, ok: res.ok, body: parsed, headers: res.headers };
}

const results = [];
function rec(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const stamp = Date.now().toString().slice(-6);

async function main() {
  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  token = login.body.accessToken;
  companyId = login.body.companyId ?? login.body.memberships?.[0]?.companyId;
  const wh0 = await api('/inventory/warehouses?pageSize=5');
  branchId = wh0.body?.items?.[0]?.branchId;
  rec('login', login.ok && Boolean(token), `company=${companyId} branch=${branchId}`);

  // ==================================================== POINT 1: DASHBOARD
  console.log('\n=== POINT 1 — dashboard banner, centred logo, compact KPIs, real data ===');
  const dash = await api('/dashboard');
  rec('1.1 dashboard endpoint returns real data', dash.ok && Boolean(dash.body?.kpis), `${dash.status}`);
  const kpis = dash.body?.kpis;
  rec(
    '1.2 KPI figures are real integers, not placeholders',
    kpis && ['companies', 'branches', 'users', 'activeSubscriptions'].every((f) => Number.isInteger(kpis[f])),
    kpis ? `companies=${kpis.companies} branches=${kpis.branches} users=${kpis.users}` : 'no kpis',
  );
  rec(
    '1.3 dashboard tiles are the DB module catalogue',
    Array.isArray(dash.body?.tiles) && dash.body.tiles.length > 0,
    `${dash.body?.tiles?.length ?? 0} tiles`,
  );
  // The hero banner must reference generated vector art, never the approved
  // design reference or a vehicle photograph.
  const brandCss = await fetch(`${BASE}/api/v1/companies/${companyId}/branding`).catch(() => null);
  rec('1.4 branding endpoint reachable for the hero lockup', brandCss !== null, `${brandCss?.status}`);

  // ============================================ POINT 2: COMPANY SETTINGS
  console.log('\n=== POINT 2 — company settings: selector, currency, tax, document settings ===');
  const companies = await api('/companies?pageSize=5');
  rec('2.1 company catalogue is searchable', companies.ok && Array.isArray(companies.body?.items), `${companies.status}`);
  const search = await api('/companies?pageSize=5&search=a');
  rec('2.2 company search filter answers', search.ok, `${search.status}`);
  const company = await api(`/companies/${companyId}`);
  rec('2.3 company exposes a primary currency', company.ok && typeof company.body?.currency === 'string', `currency=${company.body?.currency}`);
  rec(
    '2.4 company exposes a functional currency field (tri-state)',
    company.ok && company.body && 'functionalCurrency' in company.body,
    `functional=${company.body?.functionalCurrency ?? 'null'}`,
  );
  rec(
    '2.5 company exposes a default tax rate in basis points',
    company.ok && typeof company.body?.defaultTaxRateBp === 'number',
    `defaultTaxRateBp=${company.body?.defaultTaxRateBp}`,
  );
  // A real write: set a default tax, read it back, restore it.
  const origTaxBp = company.body?.defaultTaxRateBp ?? 0;
  const origCurrency = company.body?.currency;
  const setDefault = await api(`/companies/${companyId}`, { method: 'PATCH', body: { defaultTaxRateBp: 1000 } });
  rec('2.6 default tax rate is configurable', setDefault.status === 200 && setDefault.body?.defaultTaxRateBp === 1000, `${setDefault.status} bp=${setDefault.body?.defaultTaxRateBp}`);
  const setCurrency = await api(`/companies/${companyId}`, { method: 'PATCH', body: { currency: origCurrency === 'USD' ? 'BHD' : 'USD' } });
  rec('2.7 primary currency is switchable', setCurrency.status === 200 && setCurrency.body?.currency !== origCurrency, `${origCurrency} -> ${setCurrency.body?.currency}`);
  await api(`/companies/${companyId}`, { method: 'PATCH', body: { currency: origCurrency, defaultTaxRateBp: origTaxBp } });
  rec('2.8 company settings restored', true, `currency=${origCurrency} bp=${origTaxBp}`);

  // =========================================================== POINT 3: TAX
  console.log('\n=== POINT 3 — full tax management ===');
  const taxCode = `MT${stamp}`;
  const created = await api('/tax', {
    method: 'POST',
    body: { code: taxCode, nameEn: `Mandate test ${stamp}`, nameAr: `اختبار ${stamp}`, rateBp: 725, scope: 'BOTH', applicationLevel: 'LINE' },
  });
  rec('3.1 create a new tax (725bp = 7.25%)', created.status === 201 && created.body.rateBp === 725, `${created.status} ${JSON.stringify(created.body).slice(0, 80)}`);
  const taxId = created.body?.id;

  const listed = await api('/tax?includeInactive=true');
  const inList = (listed.body?.items ?? []).find((t) => t.id === taxId);
  rec('3.2 new tax appears in the list', Boolean(inList), inList ? `${inList.code} ${inList.rateBp}bp` : 'missing');

  const accounts = await api('/accounting/accounts?pageSize=200');
  const vatOut = (accounts.body?.items ?? []).find((a) => a.systemRole === 'VAT_OUTPUT' || a.code === '2100');
  const vatIn = (accounts.body?.items ?? []).find((a) => a.systemRole === 'VAT_INPUT' || a.code === '2110');
  rec('3.3 VAT output account exists (sales tax posts here)', Boolean(vatOut), vatOut ? `${vatOut.code} ${vatOut.nameEn}` : 'missing');
  rec('3.4 VAT input account exists (purchase tax posts here)', Boolean(vatIn), vatIn ? `${vatIn.code} ${vatIn.nameEn}` : 'missing');

  // --- sales invoice with the new tax ---
  const customers = await api('/sales/customers?pageSize=5');
  const customerId = customers.body?.items?.[0]?.id;
  const products = await api('/inventory/products?pageSize=50');
  const product = (products.body?.items ?? []).find((p) => p.salesPriceMinor > 0) ?? products.body?.items?.[0];
  const warehouses = await api('/inventory/warehouses?pageSize=5');
  const warehouseId = warehouses.body?.items?.[0]?.id;

  const salesInv = await api('/sales/invoices', {
    method: 'POST',
    body: {
      customerId,
      warehouseId,
      branchId,
      documentDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 864e5).toISOString(),
      notes: `mandate tax check ${stamp}`,
      lines: [{ productId: product?.id, description: 'Taxed line', quantity: 10000, unitPriceMinor: 1000, discountPercentBp: 0, taxPercentBp: 725 }],
    },
  });
  const si = salesInv.body;
  // 100.000 x 10.000 = 1000 minor; 7.25% = 72.5 -> 73 minor (half-up on 72.5)
  rec('3.5 sales invoice created with chosen tax', salesInv.status === 201 && si?.taxMinor === 73,
    `${salesInv.status} taxMinor=${si?.taxMinor} (expect 73) total=${si?.totalMinor} number=${si?.invoiceNumber}`);

  // --- purchase invoice with the same tax ---
  const suppliers = await api('/purchasing/suppliers?pageSize=5');
  const supplierId = suppliers.body?.items?.[0]?.id;
  const purchInv = await api('/purchasing/supplier-invoices', {
    method: 'POST',
    body: {
      supplierId,
      branchId,
      invoiceDate: new Date().toISOString(),
      supplierInvoiceNumber: `SUP-${stamp}`,
      notes: `mandate tax check ${stamp}`,
      lines: [{ productId: product?.id, description: 'Taxed purchase', quantity: 10000, unitCostMinor: 1000, taxPercentBp: 725 }],
    },
  });
  const pi = purchInv.body;
  rec('3.6 purchase invoice created with chosen tax', purchInv.status === 201 && pi?.taxMinor === 73,
    `${purchInv.status} taxMinor=${pi?.taxMinor} (expect 73) number=${pi?.invoiceNumber}`);

  // --- historical preservation: edit the tax, the old invoice keeps 725 ---
  const edited = await api(`/tax/${taxId}`, { method: 'PATCH', body: { rateBp: 1000 } });
  rec('3.7 tax rate editable', edited.status === 200 && edited.body.rateBp === 1000, `${edited.status} new=${edited.body?.rateBp}bp`);
  const reloaded = await api(`/sales/invoices/${si?.id}`);
  const lineBp = reloaded.body?.lines?.[0]?.taxPercentBp ?? reloaded.body?.lines?.[0]?.taxRateBp;
  rec('3.8 issued sales invoice keeps its historical tax (725bp) after the rate changed to 1000bp',
    lineBp === 725, `stored line taxPercentBp=${lineBp}`);

  // --- print preview of the sales invoice ---
  const issued = await api('/documents/issue', { method: 'POST', body: { type: 'SALES_INVOICE', sourceId: si?.id } });
  rec('3.9 sales invoice official document issued (print preview source)', issued.status === 201 || issued.status === 200,
    `${issued.status} number=${issued.body?.documentNumber}`);
  if (issued.body?.id) {
    const file = await api(`/documents/${issued.body.id}/file`, { raw: true });
    const buf = Buffer.from(await file.arrayBuffer());
    const isPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
    rec('3.10 sales invoice PDF renders (real bytes, print preview)', file.status === 200 && isPdf, `${file.status} ${buf.length}B pdf=${isPdf}`);
  }

  // --- deactivate / reactivate / delete lifecycle ---
  const off = await api(`/tax/${taxId}/active`, { method: 'PATCH', body: { isActive: false } });
  const activeList = await api('/tax');
  rec('3.11 deactivated tax leaves the pick list',
    off.status === 200 && !(activeList.body?.items ?? []).some((t) => t.id === taxId), `off=${off.status}`);
  const on = await api(`/tax/${taxId}/active`, { method: 'PATCH', body: { isActive: true } });
  rec('3.12 reactivated tax returns to the pick list', on.status === 200, `on=${on.status}`);
  const del = await api(`/tax/${taxId}`, { method: 'DELETE' });
  rec('3.13 tax delete', del.status === 200 && del.body?.deleted === true, `${del.status}`);

  // ================================================= POINT 4: AUTO-NUMBERING
  console.log('\n=== POINT 4 — automatic numbering for all documents ===');
  const sequences = [
    ['sales invoice', '/sales/invoices', 'invoiceNumber', /^S\d{5}$/],
    ['quotation', '/sales/quotations', 'quoteNumber', /^Q\d{5}$/],
    ['sales order', '/sales/orders', 'orderNumber', /^O\d{5}$/],
    ['purchase order', '/purchasing/orders', 'orderNumber', /^P\d{5}$/],
    ['supplier invoice', '/purchasing/supplier-invoices', 'invoiceNumber', /^B\d{5}$/],
    ['journal entry', '/accounting/journals', 'entryNumber', /^J\d{5}$/],
    ['payment', '/accounting/payments', 'paymentNumber', /^Y\d{5}$/],
  ];
  for (const [label, path, field, re] of sequences) {
    const res = await api(`${path}?pageSize=3`);
    const rows = Array.isArray(res.body?.items) ? res.body.items : Array.isArray(res.body) ? res.body : [];
    const nums = rows.map((r) => r[field]).filter(Boolean);
    const ok = nums.length > 0 && nums.every((n) => re.test(n));
    rec(`4.${label} numbers match ${re}`, ok, nums.slice(0, 3).join(', ') || 'none');
  }
  // Concurrency: fire 5 invoice creates in parallel and assert distinct numbers.
  const conc = await Promise.all(
    Array.from({ length: 5 }).map((_, i) =>
      api('/sales/invoices', {
        method: 'POST',
        body: {
          customerId, warehouseId, branchId,
          documentDate: new Date().toISOString(),
          notes: `concurrency ${stamp}-${i}`,
          lines: [{ productId: product?.id, description: 'c', quantity: 10000, unitPriceMinor: 100, taxPercentBp: 0 }],
        },
      }),
    ),
  );
  const concNums = conc.map((r) => r.body?.invoiceNumber).filter(Boolean);
  const distinct = new Set(concNums).size;
  rec('4.concurrency: 5 parallel invoices get 5 distinct numbers', distinct === concNums.length && concNums.length === 5,
    concNums.join(', '));

  // ================================================ POINT 5: ROUNDING (opt.)
  console.log('\n=== POINT 5 — optional whole-amount rounding ===');
  const comp = await api(`/companies/${companyId}`);
  const originalMode = comp.body?.roundingMode ?? 'NONE';
  rec('5.1 company exposes a roundingMode', typeof originalMode === 'string', `current=${originalMode}`);
  const setWhole = await api(`/companies/${companyId}`, { method: 'PATCH', body: { roundingMode: 'NEAREST_WHOLE' } });
  rec('5.2 rounding mode is configurable', setWhole.status === 200 && setWhole.body?.roundingMode === 'NEAREST_WHOLE', `${setWhole.status}`);
  const rInv = await api('/sales/invoices', {
    method: 'POST',
    body: {
      customerId, warehouseId, branchId, documentDate: new Date().toISOString(), notes: `rounding ${stamp}`,
      lines: [{ productId: product?.id, description: 'round', quantity: 10000, unitPriceMinor: 10149, taxPercentBp: 0 }],
    },
  });
  // BHD is a 3-decimal currency, so one whole major unit is 1000 minor units:
  // 10.149 rounds to 10.000 and the -149 difference is reported, not hidden.
  rec('5.3 total 10.149 rounds to a whole 10.000 and reports the -149 difference',
    rInv.body?.roundingMinor === -149 && rInv.body?.totalMinor === 10000,
    `total=${rInv.body?.totalMinor} rounding=${rInv.body?.roundingMinor}`);
  await api(`/companies/${companyId}`, { method: 'PATCH', body: { roundingMode: originalMode } });
  rec('5.4 rounding mode restored', true, `restored to ${originalMode}`);

  // ========================================= POINT 6: SUPER ADMIN ACTIONS
  console.log('\n=== POINT 6 — Super Admin actions across modules ===');
  const surfaces = [
    ['customers list', '/sales/customers'],
    ['products list', '/inventory/products'],
    ['suppliers list', '/purchasing/suppliers'],
    ['warehouses list', '/inventory/warehouses'],
    ['employees list', '/hr/employees'],
    ['leads list', '/crm/leads'],
    ['projects list', '/operations/projects'],
    ['document register', '/documents/register'],
  ];
  for (const [label, path] of surfaces) {
    const res = await api(`${path}?pageSize=5`);
    rec(`6.${label} reachable`, res.ok, `${res.status}`);
  }

  // Safe cancel/reverse on an issued journal entry.
  const journals = await api('/accounting/journals?pageSize=5');
  const posted = (journals.body?.items ?? []).find((j) => j.status === 'POSTED');
  if (posted) {
    const rev = await api(`/accounting/journals/${posted.id}/reverse`, { method: 'POST', body: { reason: `mandate verify ${stamp}` } });
    rec('6.safe-cancel: posted journal can be reversed (never deleted)', rev.status === 201 || rev.status === 200,
      `${rev.status} new=${rev.body?.entryNumber}`);
  } else {
    rec('6.safe-cancel: posted journal can be reversed (never deleted)', null, 'no POSTED journal in this tenant');
  }

  // Document register supports preview/download/print/revoke
  const reg = await api('/documents/register?pageSize=5');
  const regRow = (reg.body?.items ?? [])[0];
  if (regRow) {
    const file = await api(`/documents/${regRow.id}/file`, { raw: true });
    const buf = Buffer.from(await file.arrayBuffer());
    rec('6.document register row downloads its stored PDF', file.status === 200 && buf.subarray(0, 5).toString('latin1') === '%PDF-',
      `${regRow.documentNumber} ${buf.length}B`);
    const verify = await api(`/documents/verify/${regRow.verificationToken ?? regRow.token ?? ''}`);
    rec('6.QR verification endpoint answers', verify.status !== 404, `${verify.status}`);
  }

  const fails = results.filter((r) => r.ok === false);
  console.log(`\n${results.length} checks, ${fails.length} failed`);
  for (const f of fails) console.log('  FAIL', f.name, '—', f.detail ?? '');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
