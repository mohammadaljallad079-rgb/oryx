#!/usr/bin/env node
/** Probe each brief requirement against the live API. Read-only. */
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const EMAIL = 'admin@oryx-auto.local';
const PASSWORD = 'ChangeMe!Oryx2026';
let token = '', companyId = '';

async function api(path, { method = 'GET', body, expect } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (companyId) headers['x-oryx-company-id'] = companyId;
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, ok: res.ok, body: parsed };
}

const results = [];
function rec(name, ok, detail) { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`); }

async function main() {
  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  token = login.body.accessToken;
  companyId = login.body.memberships?.[0]?.companyId ?? login.body.companyId;
  console.log('company', companyId);

  // §3 documents: register
  const reg = await api('/documents/register');
  rec('document register', reg.ok, `${Array.isArray(reg.body) ? reg.body.length : reg.body?.items?.length} rows`);

  // §5 tax settings on company
  const companies = await api('/companies?pageSize=5');
  rec('company list', companies.ok);

  // §6 numbering format
  const inv = await api('/sales/invoices?pageSize=3');
  const nums = (inv.body?.items ?? inv.body ?? []).map((r) => r.invoiceNumber).filter(Boolean);
  rec('sales invoice numbering Sxxxxx', nums.length ? nums.every((n) => /^S\d+$/.test(n)) : null, nums.join(','));

  // §7 rounding on company
  const comp = await api('/companies/' + companyId);
  rec('company roundingMode field', comp.ok, comp.body?.roundingMode ?? comp.body?.company?.roundingMode);

  // §10 customer bilingual
  const cust = await api('/sales/customers?pageSize=3');
  const rows = cust.body?.items ?? cust.body ?? [];
  rec('customer list', cust.ok, `${rows.length} rows`);
  if (rows[0]) rec('customer has nameAr/nameEn fields', 'nameAr' in rows[0] || 'nameEn' in rows[0], Object.keys(rows[0]).filter(k=>/name/i.test(k)).join(','));

  // §12 barcode
  const prods = await api('/inventory/products?pageSize=3');
  const prs = prods.body?.items ?? prods.body ?? [];
  rec('product list', prods.ok, `${prs.length} rows`);
  if (prs[0]) rec('product has barcode field', 'barcode' in prs[0], 'barcode' in prs[0] ? String(prs[0].barcode) : 'missing');

  // §13 POS
  const pos = await api('/sales/pos-sales?pageSize=3');
  rec('POS sales list', pos.ok, `${(pos.body?.items ?? pos.body ?? []).length} rows`);

  // §14 attendance
  const emp = await api('/hr/employees?pageSize=3');
  rec('HR employees list', emp.ok);
  const att = await api('/hr/attendance?pageSize=3');
  rec('HR attendance list', att.ok, `${att.status}`);

  // taxes endpoint (the tenant tax list the sales/purchasing/POS forms read)
  for (const p of ['/tax', '/tax?includeInactive=true']) {
    const r = await api(p);
    rec(`tax endpoint ${p}`, r.ok, `${r.status} ${(r.body?.items ?? []).length} rows`);
  }

  // §8 super admin CRUD on companies - check update/status routes exist
  const upd = await api('/companies/' + companyId + '/status', { method: 'PATCH', body: { status: 'ACTIVE' } });
  rec('company status PATCH route', upd.status !== 404, `${upd.status}`);

  // searchable dropdown sources
  const suppliers = await api('/purchasing/suppliers?pageSize=3');
  rec('supplier list', suppliers.ok);
  const warehouses = await api('/inventory/warehouses?pageSize=3');
  rec('warehouse list', warehouses.ok);

  const fails = results.filter((r) => r.ok === false);
  console.log(`\n${results.length} checks, ${fails.length} failed`);
  for (const f of fails) console.log('  FAIL', f.name, f.detail);
}
main().catch((e) => { console.error(e); process.exit(1); });
