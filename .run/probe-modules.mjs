/**
 * Live functional probe across every routed module's primary API surface.
 *
 * Two principals are used because the platform governance surfaces require
 * PLATFORM-scope permissions and the ERP surfaces require a tenant context:
 *
 *   - Super Admin            -> /companies, /plans, /cms/*, /integrations, ...
 *   - Enterprise admin (tenant that licenses every module) -> /accounting, ...
 *
 * The output is the evidence table for
 * docs/audit/09_EXECUTION_06_FUNCTIONAL_MATRIX.md.
 *
 * Usage: node .run/probe-modules.mjs
 */
import { writeFileSync } from 'node:fs';

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';
const PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026';
const SUPER = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local';
const ENTERPRISE = process.env.SEED_ENTERPRISE_ADMIN_EMAIL ?? 'admin@oryx-auto.local';

async function signIn(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status}`);
  return (await res.json()).accessToken;
}

const superHeaders = { Authorization: `Bearer ${await signIn(SUPER)}` };
const tenantHeaders = { Authorization: `Bearer ${await signIn(ENTERPRISE)}` };

/** module -> [path, principal] */
const SURFACE = {
  'Super Admin — companies': ['/companies?pageSize=5', 'platform'],
  'Super Admin — permission catalog': ['/permissions/catalog', 'platform'],
  'Super Admin — modules': ['/modules', 'platform'],
  'Super Admin — plans': ['/plans', 'platform'],
  'Super Admin — subscriptions': ['/subscriptions', 'platform'],
  'Super Admin — dashboard': ['/dashboard', 'platform'],
  'Super Admin — audit trail': ['/audit-logs?pageSize=5', 'platform'],
  'Super Admin — support sessions': ['/support-sessions', 'platform'],
  'Website / CMS — pages': ['/cms/pages', 'platform'],
  'Website / CMS — banners': ['/cms/banners', 'platform'],
  'Website / CMS — service categories': ['/cms/service-categories', 'platform'],
  'Website / CMS — notification templates': ['/cms/notification-templates', 'platform'],
  'Application — feature flags': ['/cms/feature-flags', 'platform'],
  'Application — app versions': ['/cms/app-versions', 'platform'],
  'Application — API clients': ['/cms/api-clients', 'platform'],
  'Integrations — provider catalogue': ['/integrations', 'platform'],
  'Accounting — chart of accounts': ['/accounting/accounts?pageSize=5', 'tenant'],
  'Accounting — fiscal years': ['/accounting/fiscal-years', 'tenant'],
  'Accounting — journals': ['/accounting/journals?pageSize=5', 'tenant'],
  'Accounting — trial balance': ['/accounting/trial-balance', 'tenant'],
  'Accounting — income statement': ['/accounting/income-statement', 'tenant'],
  'Accounting — balance sheet': ['/accounting/balance-sheet', 'tenant'],
  'Accounting — receivables aging': ['/accounting/receivables-aging', 'tenant'],
  'Accounting — payables aging': ['/accounting/payables-aging', 'tenant'],
  'Sales — customers': ['/sales/customers?pageSize=5', 'tenant'],
  'Sales — quotations': ['/sales/quotations?pageSize=5', 'tenant'],
  'Sales — orders': ['/sales/orders?pageSize=5', 'tenant'],
  'Sales — invoices': ['/sales/invoices?pageSize=5', 'tenant'],
  'Sales — credit notes': ['/sales/credit-notes?pageSize=5', 'tenant'],
  'Sales — cashier sessions': ['/sales/cashier-sessions?pageSize=5', 'tenant'],
  'Sales — POS sales': ['/sales/pos-sales?pageSize=5', 'tenant'],
  'Purchasing — suppliers': ['/purchasing/suppliers?pageSize=5', 'tenant'],
  'Purchasing — requisitions': ['/purchasing/requisitions?pageSize=5', 'tenant'],
  'Purchasing — purchase orders': ['/purchasing/orders?pageSize=5', 'tenant'],
  'Purchasing — goods receipts': ['/purchasing/receipts?pageSize=5', 'tenant'],
  'Purchasing — supplier invoices': ['/purchasing/supplier-invoices?pageSize=5', 'tenant'],
  'Purchasing — returns': ['/purchasing/returns?pageSize=5', 'tenant'],
  'Inventory — warehouses': ['/inventory/warehouses?pageSize=5', 'tenant'],
  'Inventory — products': ['/inventory/products?pageSize=5', 'tenant'],
  'Inventory — movements': ['/inventory/movements?pageSize=5', 'tenant'],
  'Inventory — transfers': ['/inventory/transfers?pageSize=5', 'tenant'],
  'Inventory — adjustments': ['/inventory/adjustments?pageSize=5', 'tenant'],
  'Inventory — valuation': ['/inventory/valuation', 'tenant'],
  'Inventory — reorder alerts': ['/inventory/reorder-alerts', 'tenant'],
  'HR — departments': ['/hr/departments?pageSize=5', 'tenant'],
  'HR — job titles': ['/hr/job-titles?pageSize=5', 'tenant'],
  'HR — employees': ['/hr/employees?pageSize=5', 'tenant'],
  'HR — shifts': ['/hr/shifts?pageSize=5', 'tenant'],
  'HR — leave requests': ['/hr/leave-requests?pageSize=5', 'tenant'],
  'HR — attendance': ['/hr/attendance?pageSize=5', 'tenant'],
  'HR — leave types': ['/hr/leave-types', 'tenant'],
  'HR — payroll runs': ['/hr/payroll-runs?pageSize=5', 'tenant'],
  'HR — advances': ['/hr/advances?pageSize=5', 'tenant'],
  'HR — dashboard': ['/hr/dashboard', 'tenant'],
  'CRM — lead sources': ['/crm/lead-sources?pageSize=5', 'tenant'],
  'CRM — leads': ['/crm/leads?pageSize=5', 'tenant'],
  'CRM — pipelines': ['/crm/pipelines', 'tenant'],
  'CRM — opportunities': ['/crm/opportunities?pageSize=5', 'tenant'],
  'CRM — activities': ['/crm/activities?pageSize=5', 'tenant'],
  'CRM — SLA policies': ['/crm/sla-policies?pageSize=5', 'tenant'],
  'CRM — tickets': ['/crm/tickets?pageSize=5', 'tenant'],
  'CRM — segments': ['/crm/segments?pageSize=5', 'tenant'],
  'CRM — dashboard': ['/crm/dashboard', 'tenant'],
  'Operations — projects': ['/operations/projects?pageSize=5', 'tenant'],
  'Operations — tasks': ['/operations/tasks?pageSize=5', 'tenant'],
  'Operations — work orders': ['/operations/work-orders?pageSize=5', 'tenant'],
  'Operations — approvals': ['/operations/approvals?pageSize=5', 'tenant'],
  'Operations — calendar': ['/operations/calendar', 'tenant'],
  'Operations — notifications': ['/operations/notifications?pageSize=5', 'tenant'],
  'Operations — dashboard': ['/operations/dashboard', 'tenant'],
  'Automotive — vehicles': ['/automotive/vehicles?pageSize=5', 'tenant'],
  'Automotive — inspection services': ['/automotive/inspection-services?pageSize=5', 'tenant'],
  'Automotive — inspection bookings': ['/automotive/inspection-bookings?pageSize=5', 'tenant'],
  'Automotive — bays': ['/automotive/bays?pageSize=5', 'tenant'],
  'Automotive — maintenance bookings': ['/automotive/maintenance-bookings?pageSize=5', 'tenant'],
  'Automotive — job cards': ['/automotive/job-cards?pageSize=5', 'tenant'],
  'Automotive — reservations': ['/automotive/reservations?pageSize=5', 'tenant'],
  'Automotive — warranties': ['/automotive/warranties?pageSize=5', 'tenant'],
  'Automotive — providers': ['/automotive/providers?pageSize=5', 'tenant'],
  'Automotive — service requests': ['/automotive/service-requests?pageSize=5', 'tenant'],
  'Automotive — settlements': ['/automotive/settlements?pageSize=5', 'tenant'],
  'Automotive — dashboard': ['/automotive/dashboard', 'tenant'],
  'Marketplace — provider applications': ['/marketplace/admin/applications?pageSize=5', 'tenant'],
  'Marketplace — provider directory': ['/marketplace/providers?pageSize=5', 'tenant'],
  'Bookings — bookings': ['/bookings?pageSize=5', 'tenant'],
  'Bookings — calendar': ['/bookings/calendar?from=2026-10-01&to=2026-10-31', 'tenant'],
  'Bookings — resources': ['/bookings/resources/list', 'tenant'],
  'Payments — providers': ['/payments/providers', 'tenant'],
  'Payments — intents': ['/payments/intents?pageSize=5', 'tenant'],
  'Payments — reconciliations': ['/payments/reconciliations', 'tenant'],
  'Customer platform — summary': ['/customer-platform/summary', 'tenant'],
  'Customer platform — accounts': ['/customer-platform/accounts?pageSize=5', 'tenant'],
  'Reports — accounting': ['/reports/accounting', 'tenant'],
  'Reports — sales': ['/reports/sales', 'tenant'],
  'Reports — purchasing': ['/reports/purchasing', 'tenant'],
  'Reports — inventory': ['/reports/inventory', 'tenant'],
};

function summarise(text) {
  if (!text) return 'empty';
  try {
    const body = JSON.parse(text);
    if (Array.isArray(body)) return `array(${body.length})`;
    if (body && typeof body === 'object') {
      if (Array.isArray(body.items)) return `items(${body.items.length}) total=${body.total ?? '?'}`;
      return `object(${Object.keys(body).length} keys)`;
    }
    return typeof body;
  } catch {
    return 'non-json';
  }
}

const rows = [];
for (const [module, [path, principal]] of Object.entries(SURFACE)) {
  const res = await fetch(`${API}${path}`, {
    headers: principal === 'platform' ? superHeaders : tenantHeaders,
  });
  const text = await res.text();
  rows.push({ module, path, principal, status: res.status, summary: summarise(text) });
}

const ok = rows.filter((r) => r.status === 200).length;
for (const r of rows) {
  console.log(`${r.status === 200 ? 'PASS' : 'FAIL'}  ${String(r.status).padEnd(4)} ${r.module.padEnd(40)} ${r.path}`);
}
console.log(`\n${ok}/${rows.length} module surfaces returned 200`);

const out = process.env.PROBE_OUT ?? 'docs/audit/evidence/exec06-module-probe.json';
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), ok, total: rows.length, rows }, null, 2));
console.log(`written ${out}`);
