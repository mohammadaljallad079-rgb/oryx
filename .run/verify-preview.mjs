/**
 * Externally verifies every ORYX preview route over the public HTTPS ingress.
 *
 * The owner's requirement is a set of links that open the real platform, so this
 * checks the same URLs a browser would reach — through the *.all-hands.dev TLS
 * terminator, not localhost — and reports the status and response size for each.
 *
 * Run with: node .run/verify-preview.mjs
 */
const ADMIN = 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';

const ADMIN_ROUTES = [
  ['/login', 'Sign in'],
  ['/dashboard', 'Super Admin / company dashboard'],
  ['/companies', 'Companies and tenants'],
  ['/subscriptions', 'Subscriptions and plans'],
  ['/plans', 'SaaS plans'],
  ['/users', 'Users'],
  ['/roles', 'Roles and permissions'],
  ['/branches', 'Branches'],
  ['/modules', 'ERP module catalog'],
  ['/accounting', 'Accounting'],
  ['/sales', 'Sales and POS'],
  ['/inventory', 'Inventory'],
  ['/purchasing', 'Procurement'],
  ['/hr', 'HR and payroll'],
  ['/crm', 'CRM'],
  ['/operations', 'Operations and projects'],
  ['/automotive/inspections', 'Automotive — inspections'],
  ['/automotive/maintenance', 'Automotive — workshop / maintenance'],
  ['/automotive/spare-parts', 'Automotive — spare parts'],
  ['/bookings', 'Booking engine'],
  ['/payments', 'Payments'],
  ['/reports', 'Reports'],
  ['/providers', 'Marketplace providers'],
  ['/integrations', 'External Integrations Center'],
  ['/website', 'Website CMS'],
  ['/application', 'Application management'],
  ['/api-management', 'API management'],
  ['/audit', 'Audit trail'],
  ['/support', 'Support sessions'],
  ['/security', 'Security'],
  ['/settings', 'Settings'],
];

const CUSTOMER_ROUTES = [
  ['/', 'Customer website home'],
  ['/services', 'Services'],
  ['/providers', 'Provider directory'],
  ['/login', 'Customer sign in'],
  ['/register', 'Customer registration'],
  ['/dashboard', 'Customer dashboard'],
  ['/garage', 'Vehicle garage'],
  ['/bookings', 'Bookings'],
  ['/invoices', 'Invoices'],
  ['/notifications', 'Notifications'],
  ['/profile', 'Profile and privacy'],
  ['/support', 'Support'],
  ['/mobile/', 'Mobile app (Expo web export)'],
  ['/mobile/services', 'Mobile services'],
  ['/mobile/account', 'Mobile account'],
];

const API_ROUTES = [
  ['/api/health', 'API health (version-neutral)'],
];

async function probe(base, path, label) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const body = await res.text();
    return { label, path, status: res.status, bytes: body.length, ok: res.ok };
  } catch (err) {
    return { label, path, status: 'ERR', bytes: 0, ok: false, error: String(err) };
  }
}

function report(title, rows) {
  console.log(`\n### ${title}\n`);
  let failures = 0;
  for (const r of rows) {
    const mark = r.ok ? 'ok  ' : 'FAIL';
    if (!r.ok) failures++;
    console.log(
      `${mark} ${String(r.status).padEnd(4)} ${String(r.bytes).padStart(7)}B  ${r.label}  (${r.path})`,
    );
  }
  return failures;
}

const admin = await Promise.all(ADMIN_ROUTES.map(([p, l]) => probe(ADMIN, p, l)));
const customer = await Promise.all(CUSTOMER_ROUTES.map(([p, l]) => probe(CUSTOMER, p, l)));
const api = await Promise.all(API_ROUTES.map(([p, l]) => probe(ADMIN, p, l)));

let failures = 0;
failures += report(`Admin / control plane — ${ADMIN}`, admin);
failures += report(`Customer site and mobile — ${CUSTOMER}`, customer);
failures += report(`API — ${ADMIN}`, api);

const total = admin.length + customer.length + api.length;
console.log(`\n${total - failures}/${total} preview routes returned a success status.`);
process.exit(failures === 0 ? 0 : 1);
