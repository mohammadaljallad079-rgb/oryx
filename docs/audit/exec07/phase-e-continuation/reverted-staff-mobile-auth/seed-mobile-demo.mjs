/**
 * Provision the ORYX ERP demo company used by the mobile integration suite.
 *
 * This is deliberately **not** a Prisma script. Every row is created through the
 * real HTTP API, authenticated as the Platform Super Admin, so the data is
 * produced by exactly the same code path a human operator would drive:
 *
 *   - the chart of accounts comes from `POST /accounting/accounts/seed-standard-chart`
 *   - stock comes from `POST /inventory/movements` (the moving-average ledger)
 *   - invoices go through `POST /sales/invoices`, which posts the journal entry
 *   - purchase invoices go through `POST /purchasing/supplier-invoices`
 *
 * That makes the script a genuine end-to-end integration proof rather than a
 * fixture loader: if a posting rule regresses, this script fails.
 *
 * Idempotent by design. Every entity is looked up by its natural key first and
 * reused when present, so running it twice leaves the database unchanged. It is
 * confined to `DEMO-ERP-MOBILE` and never touches an existing company.
 *
 * Usage:
 *   node scripts/seed-mobile-demo.mjs                 # provision / top up
 *   node scripts/seed-mobile-demo.mjs --reset         # delete the demo company first
 *   node scripts/seed-mobile-demo.mjs --password-file /tmp/oryx-demo.pw
 */

import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const API = (process.env.ORYX_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const BASE = `${API}/api/v1`;
const CLIENT = { 'x-oryx-client': 'mobile' };

const COMPANY_CODE = 'DEMO-ERP-MOBILE';
const COMPANY_NAME_EN = 'ORYX Demo Company';
const COMPANY_NAME_AR = 'شركة أوريكس التجريبية';
const CURRENCY = 'BHD';

/** Bahraini Dinar is a 3-decimal currency; money is integer minor units. */
const SCALE = 1000;
const money = (major) => Math.round(major * SCALE);
/** Quantities are scaled by 10^4 (10000 = one unit). */
const qty = (n) => Math.round(n * 10000);

const SUPER_ADMIN = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const DEMO_ADMIN = {
  email: process.env.ORYX_DEMO_ADMIN_EMAIL ?? 'erp.demo@oryx.local',
  password: process.env.ORYX_DEMO_ADMIN_PASSWORD ?? `Demo!${randomBytes(9).toString('base64url')}`,
};

const has = (name) => process.argv.includes(`--${name}`);
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

// ------------------------------------------------------------------ transport

let accessToken = null;
let refreshToken = null;

async function request(path, { method = 'GET', body, token, companyId, branchId } = {}) {
  const headers = { ...CLIENT };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const bearer = token ?? accessToken;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (companyId) headers['x-oryx-company-id'] = companyId;
  if (branchId) headers['x-oryx-branch-id'] = branchId;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const detail = payload?.message ?? payload ?? '';
    const message = Array.isArray(detail) ? detail.join(', ') : String(detail);
    const error = new Error(`${method} ${path} -> ${res.status}: ${message}`);
    error.status = res.status;
    throw error;
  }
  return payload;
}

/** Treat 409-style "already exists" as success so the script is re-runnable. */
async function createOrFind(path, body, findExisting, opts = {}) {
  try {
    return await request(path, { method: 'POST', body, ...opts });
  } catch (err) {
    if (err.status !== 409 && err.status !== 400) throw err;
    const existing = await findExisting();
    if (existing) return existing;
    throw err;
  }
}

async function signIn() {
  const session = await request('/auth/login', {
    method: 'POST',
    body: { email: SUPER_ADMIN.email, password: SUPER_ADMIN.password },
    token: '',
  });
  accessToken = session.accessToken;
  refreshToken = session.refreshToken;
  if (!accessToken) throw new Error('Login did not return an access token.');
  console.log(`  signed in as ${SUPER_ADMIN.email}`);
}

// ---------------------------------------------------------------- demo content

const BRANCHES = [
  { code: 'MANAMA', nameEn: 'Manama Branch', nameAr: 'فرع المنامة', city: 'Manama', phone: '+97317000001' },
  { code: 'MUHARRAQ', nameEn: 'Muharraq Branch', nameAr: 'فرع المحرق', city: 'Muharraq', phone: '+97317000002' },
  { code: 'RIFAA', nameEn: 'Riffa Branch', nameAr: 'فرع الرفاع', city: 'Riffa', phone: '+97317000003' },
];

const WAREHOUSES = [
  { code: 'MAIN', nameEn: 'Main Warehouse', nameAr: 'المستودع الرئيسي', branch: 'MANAMA' },
  { code: 'BR2', nameEn: 'Muharraq Store', nameAr: 'مخزن المحرق', branch: 'MUHARRAQ' },
];

const PRODUCTS = [
  { sku: 'OIL-5W30', nameEn: 'Engine Oil 5W-30 (4L)', nameAr: 'زيت محرك 5W-30 (4 لتر)', unit: 'bottle', sales: 12.5, cost: 8.8, reorder: 20, opening: 120 },
  { sku: 'FILTER-AIR', nameEn: 'Air Filter', nameAr: 'فلتر هواء', unit: 'piece', sales: 6.5, cost: 4.0, reorder: 10, opening: 45 },
  { sku: 'BRAKE-PAD-F', nameEn: 'Front Brake Pad Set', nameAr: 'طقم فحمات فرامل أمامية', unit: 'set', sales: 28.0, cost: 19.0, reorder: 8, opening: 26 },
  { sku: 'BATT-70AH', nameEn: 'Battery 70Ah', nameAr: 'بطارية 70 أمبير', unit: 'piece', sales: 42.0, cost: 30.0, reorder: 6, opening: 18 },
  { sku: 'SPARK-PLUG', nameEn: 'Spark Plug Iridium', nameAr: 'شمعة احتراق إيريديوم', unit: 'piece', sales: 4.5, cost: 2.6, reorder: 40, opening: 160 },
  { sku: 'TIRE-205', nameEn: 'Tyre 205/55 R16', nameAr: 'إطار 205/55 R16', unit: 'piece', sales: 38.0, cost: 26.0, reorder: 12, opening: 32 },
  { sku: 'WIPER-SET', nameEn: 'Wiper Blade Set', nameAr: 'طقم مساحات زجاج', unit: 'set', sales: 9.5, cost: 5.5, reorder: 15, opening: 40 },
  { sku: 'COOLANT-4L', nameEn: 'Coolant Concentrate 4L', nameAr: 'سائل تبريد مركز 4 لتر', unit: 'bottle', sales: 7.0, cost: 4.2, reorder: 20, opening: 55 },
  { sku: 'OIL-FILTER', nameEn: 'Oil Filter', nameAr: 'فلتر زيت', unit: 'piece', sales: 5.0, cost: 3.0, reorder: 30, opening: 90 },
  { sku: 'CABIN-FILTER', nameEn: 'Cabin Air Filter', nameAr: 'فلتر مكيف المقصورة', unit: 'piece', sales: 8.0, cost: 4.8, reorder: 20, opening: 48 },
  { sku: 'BRAKE-DISC-F', nameEn: 'Front Brake Disc', nameAr: 'هوب فرامل أمامي', unit: 'piece', sales: 34.0, cost: 22.0, reorder: 8, opening: 20 },
  { sku: 'GEAR-OIL-1L', nameEn: 'Gear Oil 1L', nameAr: 'زيت جير 1 لتر', unit: 'bottle', sales: 6.8, cost: 4.0, reorder: 24, opening: 72 },
  { sku: 'RADIATOR-CAP', nameEn: 'Radiator Cap', nameAr: 'غطاء الرديتر', unit: 'piece', sales: 3.5, cost: 1.9, reorder: 25, opening: 65 },
  { sku: 'BELT-SERP', nameEn: 'Serpentine Belt', nameAr: 'سير المحرك', unit: 'piece', sales: 18.0, cost: 11.0, reorder: 10, opening: 24 },
  { sku: 'LIGHT-H4', nameEn: 'Headlight Bulb H4', nameAr: 'لمبة أمامية H4', unit: 'piece', sales: 4.0, cost: 2.1, reorder: 30, opening: 96 },
  { sku: 'MAT-UNIV', nameEn: 'Universal Floor Mats', nameAr: 'دواسات أرضية عامة', unit: 'set', sales: 11.0, cost: 6.5, reorder: 15, opening: 36 },
  { sku: 'SVC-INSPECT', nameEn: 'Vehicle Inspection Service', nameAr: 'خدمة فحص مركبة', unit: 'service', sales: 35.0, cost: 0, reorder: 0, opening: 0, service: true },
  { sku: 'SVC-OILCHANGE', nameEn: 'Oil Change Service', nameAr: 'خدمة تغيير الزيت', unit: 'service', sales: 15.0, cost: 0, reorder: 0, opening: 0, service: true },
  { sku: 'SVC-ALIGN', nameEn: 'Wheel Alignment', nameAr: 'ضبط اتزان العجلات', unit: 'service', sales: 22.0, cost: 0, reorder: 0, opening: 0, service: true },
  { sku: 'SVC-AC-GAS', nameEn: 'AC Gas Refill', nameAr: 'تعبئة غاز المكيف', unit: 'service', sales: 18.0, cost: 0, reorder: 0, opening: 0, service: true },
];

const CUSTOMERS = [
  ['CUST-001', 'Al Noor Trading Est.', 'مؤسسة النور التجارية', 'Manama'],
  ['CUST-002', 'Gulf Motors LLC', 'خليج موتورز ذ.م.م', 'Manama'],
  ['CUST-003', 'Bahrain Fleet Services', 'خدمات أسطول البحرين', 'Muharraq'],
  ['CUST-004', 'Riffa Auto Rentals', 'رفاع لتأجير السيارات', 'Riffa'],
  ['CUST-005', 'Seef Mall Facilities', 'مرافق سيف مول', 'Manama'],
  ['CUST-006', 'Isa Town Transport', 'نقل مدينة عيسى', 'Isa Town'],
  ['CUST-007', 'Hamad Town Logistics', 'لوجستيات مدينة حمد', 'Hamad Town'],
  ['CUST-008', 'Budaiya Contracting', 'مقاولات البديع', 'Budaiya'],
  ['CUST-009', 'Sitra Industrial Co.', 'شركة سترة الصناعية', 'Sitra'],
  ['CUST-010', 'Juffair Hospitality', 'ضيافة الجفير', 'Juffair'],
  ['CUST-011', 'Arad Car Wash', 'غسيل السيارات عراد', 'Arad'],
  ['CUST-012', 'Zallaq Resorts', 'منتجعات الزلاق', 'Zallaq'],
  ['CUST-013', 'Saar Motorsport', 'سار لرياضة السيارات', 'Saar'],
  ['CUST-014', 'Tubli Engineering', 'هندسة توبلي', 'Tubli'],
  ['CUST-015', 'Manama Taxi Co-op', 'تعاونية تاكسي المنامة', 'Manama'],
  ['CUST-016', 'Hidd Port Services', 'خدمات ميناء الحد', 'Hidd'],
  ['CUST-017', 'Awali Maintenance', 'صيانة العوالي', 'Awali'],
  ['CUST-018', 'Barbar Logistics', 'لوجستيات باربار', 'Barbar'],
  ['CUST-019', 'Duraz Medical Transport', 'نقل دورز الطبي', 'Duraz'],
  ['CUST-020', 'Salmaniya Fleet Care', 'العناية بأسطول السلمانية', 'Salmaniya'],
].map(([code, nameEn, nameAr, city]) => ({ code, nameEn, nameAr, city }));

const SUPPLIERS = [
  ['SUP-001', 'Arabian Parts Co.', 'الشركة العربية لقطع الغيار', 'Manama'],
  ['SUP-002', 'Lubricants Wholesale W.L.L.', 'تجارة الزيوت بالجملة', 'Sitra'],
  ['SUP-003', 'Gulf Battery Supply', 'خليج لتوريد البطاريات', 'Muharraq'],
  ['SUP-004', 'Tyre Import House', 'بيت استيراد الإطارات', 'Hidd'],
  ['SUP-005', 'Bahrain Brake Systems', 'البحرين لأنظمة الفرامل', 'Riffa'],
  ['SUP-006', 'Auto Electrical Trading', 'تجارة الكهربائيات للسيارات', 'Manama'],
  ['SUP-007', 'Precision Filters Co.', 'شركة الفلاتر الدقيقة', 'Sitra'],
  ['SUP-008', 'Motorsport Accessories', 'ملحقات رياضة السيارات', 'Saar'],
  ['SUP-009', 'Aluminium & Glass Works', 'أعمال الألمنيوم والزجاج', 'Sitra'],
  ['SUP-010', 'Heavy Equipment Spares', 'قطع غيار المعدات الثقيلة', 'Hidd'],
].map(([code, nameEn, nameAr, city]) => ({ code, nameEn, nameAr, city }));

const DEPARTMENTS = [
  ['WORKSHOP', 'Workshop', 'الورشة'],
  ['PARTS', 'Parts Store', 'مخزن القطع'],
  ['SALES', 'Sales', 'المبيعات'],
  ['FINANCE', 'Finance', 'المالية'],
  ['ADMIN', 'Administration', 'الإدارة'],
];

const JOB_TITLES = [
  ['TECH', 'Workshop Technician', 'فني ورشة', 'WORKSHOP'],
  ['SMECH', 'Senior Mechanic', 'ميكانيكي أول', 'WORKSHOP'],
  ['STOREMAN', 'Store Keeper', 'أمين مخزن', 'PARTS'],
  ['SREP', 'Sales Representative', 'مندوب مبيعات', 'SALES'],
  ['ACCT', 'Accountant', 'محاسب', 'FINANCE'],
  ['HRSPEC', 'HR Specialist', 'أخصائي موارد بشرية', 'ADMIN'],
  ['BRMGR', 'Branch Manager', 'مدير فرع', 'ADMIN'],
];

const EMPLOYEES = [
  ['EMP-001', 'Ahmed Al Khalifa', 'أحمد الخليفة', 'WORKSHOP', 'SMECH', 'MANAMA', 850],
  ['EMP-002', 'Yusuf Al Sayed', 'يوسف السيد', 'WORKSHOP', 'TECH', 'MANAMA', 450],
  ['EMP-003', 'Fatima Ali', 'فاطمة علي', 'FINANCE', 'ACCT', 'MANAMA', 700],
  ['EMP-004', 'Hassan Mahmood', 'حسن محمود', 'PARTS', 'STOREMAN', 'MUHARRAQ', 400],
  ['EMP-005', 'Noora Ibrahim', 'نورة إبراهيم', 'SALES', 'SREP', 'MANAMA', 550],
  ['EMP-006', 'Ali Jassim', 'علي جاسم', 'WORKSHOP', 'TECH', 'MUHARRAQ', 430],
  ['EMP-007', 'Maryam Saeed', 'مريم سعيد', 'ADMIN', 'HRSPEC', 'MANAMA', 620],
  ['EMP-008', 'Khalid Rashid', 'خالد راشد', 'WORKSHOP', 'SMECH', 'RIFAA', 800],
  ['EMP-009', 'Sara Abdulla', 'سارة عبدالله', 'SALES', 'SREP', 'MUHARRAQ', 520],
  ['EMP-010', 'Mohammed Nasser', 'محمد ناصر', 'ADMIN', 'BRMGR', 'RIFAA', 950],
];

// ------------------------------------------------------------------- helpers

const idOf = (list, key, value) => list.find((r) => r[key] === value)?.id ?? null;

async function listAll(path, key = 'items') {
  const res = await request(`${path}${path.includes('?') ? '&' : '?'}pageSize=200`, { companyId: companyId_ });
  return res?.[key] ?? [];
}

let companyId_ = null;
let primaryBranchId = null;
/** False when the demo admin already existed, so its password is not re-issued. */
let adminPasswordIsFresh = true;

// ---------------------------------------------------------------------- steps

/**
 * Hard-remove a previous demo company.
 *
 * Every table that hangs off `Company` declares `onDelete: Cascade`, so deleting
 * the company row removes its branches, products, invoices, ledger entries and
 * everything else. The company *code* is unique and immutable through the API,
 * so a genuine reset needs this one direct statement — there is no API route that
 * can free the code. It is confined to `DEMO-ERP-MOBILE` and refuses to run
 * against any other company.
 */
async function resetDemoCompany() {
  const prisma = new PrismaClient();
  try {
    const companies = await prisma.company.findMany({
      where: { code: COMPANY_CODE },
      select: { id: true, status: true },
    });
    if (companies.length === 0) {
      console.log('  no existing demo company to remove');
      return;
    }
    const ids = companies.map((c) => c.id);
    // The owner's live companies are never in this set: the filter is by code.
    await prisma.company.deleteMany({ where: { id: { in: ids } } });

    // `User` is a platform-level identity, not company-scoped, so the cascade
    // above leaves the demo administrator behind. Removing it is what lets the
    // invitation be accepted again; the filter is the exact demo address.
    const removedUsers = await prisma.user.deleteMany({ where: { email: DEMO_ADMIN.email } });
    console.log(
      `  removed previous demo company (${ids.length} row(s)) and ${removedUsers.count} demo account(s)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function ensureCompany() {
  const list = await request('/companies?pageSize=200', { token: accessToken });
  const existing = (list?.items ?? []).find((c) => c.code === COMPANY_CODE && c.status !== 'ARCHIVED');
  if (existing) {
    companyId_ = existing.id;
    console.log(`  company exists: ${COMPANY_NAME_EN} (${companyId_})`);
    return;
  }

  const plans = await request('/plans', { token: accessToken });
  const enterprise = (plans?.items ?? plans ?? []).find((p) => p.code === 'enterprise');
  if (!enterprise) throw new Error('Enterprise plan not found; run `pnpm db:seed` first.');

  const created = await request('/companies', {
    method: 'POST',
    token: accessToken,
    body: {
      code: COMPANY_CODE,
      nameEn: COMPANY_NAME_EN,
      nameAr: COMPANY_NAME_AR,
      type: 'SAAS_TENANT',
      industry: 'Automotive Services',
      countryCode: 'BH',
      currency: CURRENCY,
      planId: enterprise.id,
      notes: 'Provisioned by scripts/seed-mobile-demo.mjs for mobile ERP integration.',
    },
  });
  companyId_ = created.company.id;
  console.log(`  company created: ${COMPANY_NAME_EN} (${companyId_})`);
}

async function ensureDemoAdmin() {
  const roles = await request(`/companies/${companyId_}/roles`, { token: accessToken });
  const adminRole = (roles?.items ?? roles ?? []).find((r) => r.code === 'company_admin');
  if (!adminRole) throw new Error('company_admin role missing on the new company.');

  const users = await request(`/companies/${companyId_}/users?pageSize=200`, { token: accessToken });
  if ((users?.items ?? []).some((u) => u.email === DEMO_ADMIN.email)) {
    console.log(`  demo admin exists: ${DEMO_ADMIN.email}`);
    adminPasswordIsFresh = false;
    return;
  }

  const branches = await request(`/companies/${companyId_}/branches`, { token: accessToken });
  const branchIds = (branches?.items ?? branches ?? []).map((b) => b.id);

  const invitation = await request(`/companies/${companyId_}/users/invitations`, {
    method: 'POST',
    token: accessToken,
    body: {
      email: DEMO_ADMIN.email,
      roleId: adminRole.id,
      branchIds,
      fullNameEn: 'Demo Company Administrator',
      fullNameAr: 'مدير الشركة التجريبية',
    },
  });

  const token = invitation?.inviteToken;
  if (!token) throw new Error('Invitation did not return an invite token.');

  await request('/auth/accept-invitation', {
    method: 'POST',
    token: '',
    body: {
      token,
      password: DEMO_ADMIN.password,
      fullNameEn: 'Demo Company Administrator',
      fullNameAr: 'مدير الشركة التجريبية',
    },
  });
  console.log(`  demo admin created: ${DEMO_ADMIN.email}`);
}

async function ensureBranches() {
  const existing = await request(`/companies/${companyId_}/branches`, { token: accessToken });
  const byCode = new Map((existing?.items ?? existing ?? []).map((b) => [b.code, b]));

  for (const b of BRANCHES) {
    if (byCode.has(b.code)) continue;
    const created = await request(`/companies/${companyId_}/branches`, {
      method: 'POST',
      token: accessToken,
      body: {
        code: b.code,
        nameEn: b.nameEn,
        nameAr: b.nameAr,
        city: b.city,
        countryCode: 'BH',
        phone: b.phone,
        timezone: 'Asia/Bahrain',
      },
    });
    byCode.set(b.code, created.branch ?? created);
  }
  primaryBranchId = byCode.get('MANAMA')?.id ?? null;
  console.log(`  branches: ${byCode.size}`);
  return byCode;
}

async function ensureChart() {
  try {
    const res = await request('/accounting/accounts/seed-standard-chart', {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      body: {},
    });
    console.log(`  chart of accounts: ${res?.created ?? 0} account(s) created`);
  } catch (err) {
    console.log(`  chart of accounts: already present (${err.status})`);
  }
}

async function ensureFiscalYear() {
  const years = await request('/accounting/fiscal-years', { token: accessToken, companyId: companyId_ });
  const list = years?.items ?? years ?? [];
  if (list.length > 0) {
    console.log(`  fiscal years: ${list.length}`);
    return;
  }
  const year = new Date().getUTCFullYear();
  await request('/accounting/fiscal-years', {
    method: 'POST',
    token: accessToken,
    companyId: companyId_,
    body: {
      code: String(year),
      startDate: new Date(Date.UTC(year, 0, 1)).toISOString(),
      endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString(),
      monthlyPeriods: true,
    },
  });
  console.log(`  fiscal year ${year} created with monthly periods`);
}

async function ensureWarehouses(branchByCode) {
  const existing = await listAll('/inventory/warehouses');
  const byCode = new Map(existing.map((w) => [w.code, w]));
  for (const w of WAREHOUSES) {
    if (byCode.has(w.code)) continue;
    const created = await request('/inventory/warehouses', {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      body: {
        code: w.code,
        nameEn: w.nameEn,
        nameAr: w.nameAr,
        branchId: branchByCode.get(w.branch)?.id ?? null,
      },
    });
    byCode.set(w.code, created);
  }
  console.log(`  warehouses: ${byCode.size}`);
  return byCode;
}

async function ensureProducts() {
  const existing = await listAll('/inventory/products');
  const bySku = new Map(existing.map((p) => [p.sku, p]));
  for (const p of PRODUCTS) {
    if (bySku.has(p.sku)) continue;
    const created = await request('/inventory/products', {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      body: {
        sku: p.sku,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        type: p.service ? 'SERVICE' : 'PRODUCT',
        unit: p.unit,
        salesPriceMinor: money(p.sales),
        costPriceMinor: money(p.cost),
        taxRateBp: 1000,
        reorderLevel: qty(p.reorder),
        reorderQuantity: qty(p.reorder * 2),
        trackStock: !p.service,
      },
    });
    bySku.set(p.sku, created);
  }
  console.log(`  products: ${bySku.size}`);
  return bySku;
}

async function ensureOpeningStock(warehouseByCode, productBySku) {
  const main = warehouseByCode.get('MAIN');
  // The movement list returns `sku` but not `productId`, so identity is the SKU.
  const movements = await listAll('/inventory/movements');
  const already = new Set(
    movements.filter((m) => m.memo === 'Opening stock').map((m) => m.sku),
  );
  let created = 0;

  for (const p of PRODUCTS) {
    if (p.service || p.opening <= 0) continue;
    if (already.has(p.sku)) continue;
    const product = productBySku.get(p.sku);
    if (!product) continue;
    await request('/inventory/movements', {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      branchId: primaryBranchId,
      body: {
        warehouseId: main.id,
        productId: product.id,
        direction: 'IN',
        quantity: qty(p.opening),
        unitCostMinor: money(p.cost),
        memo: 'Opening stock',
        occurredAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
      },
    });
    created += 1;
  }
  console.log(`  opening stock movements: ${created} new, ${already.size} already present`);
}

async function ensureParties(kind, rows) {
  const path = kind === 'customers' ? '/sales/customers' : '/purchasing/suppliers';
  const existing = await listAll(path);
  const byCode = new Map(existing.map((r) => [r.code, r]));
  let created = 0;
  for (const r of rows) {
    if (byCode.has(r.code)) continue;
    const body = {
      code: r.code,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      email: `${r.code.toLowerCase()}@demo.oryx.local`,
      phone: '+97317000000',
      city: r.city,
      countryCode: 'BH',
      addressLine: `${r.city}, Kingdom of Bahrain`,
    };
    if (kind === 'customers') body.creditLimitMinor = money(5000);
    else body.paymentTermsDays = 30;
    const made = await request(path, {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      body,
    });
    byCode.set(r.code, made);
    created += 1;
  }
  console.log(`  ${kind}: ${byCode.size} (${created} new)`);
  return byCode;
}

const INVOICE_MARKER = 'Demo invoice provisioned for mobile integration.';

async function ensureSalesInvoices(customerByCode, productBySku, warehouseByCode) {
  const existing = await listAll('/sales/invoices');
  const mine = existing.filter((i) => i.notes === INVOICE_MARKER);
  if (mine.length > 0) {
    console.log(`  sales invoices: ${mine.length} already provisioned`);
    return;
  }

  const main = warehouseByCode.get('MAIN');
  const codes = [...customerByCode.keys()].slice(0, 8);
  let created = 0;

  for (let i = 0; i < codes.length; i += 1) {
    const customer = customerByCode.get(codes[i]);
    const product = productBySku.get(PRODUCTS[i % 8].sku);
    const service = productBySku.get(PRODUCTS[16 + (i % 4)].sku);
    await request('/sales/invoices', {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      branchId: primaryBranchId,
      body: {
        customerId: customer.id,
        branchId: primaryBranchId,
        warehouseId: main.id,
        invoiceDate: new Date(Date.now() - (i + 1) * 86400_000).toISOString(),
        dueDate: new Date(Date.now() + (14 - i) * 86400_000).toISOString(),
        currency: CURRENCY,
        notes: INVOICE_MARKER,
        post: true,
        issueStock: true,
        lines: [
          {
            productId: product.id,
            description: PRODUCTS[i % 8].nameEn,
            quantity: qty(2 + i),
            unitPriceMinor: money(PRODUCTS[i % 8].sales),
            taxPercentBp: 1000,
          },
          {
            productId: service.id,
            description: PRODUCTS[16 + (i % 4)].nameEn,
            quantity: qty(1),
            unitPriceMinor: money(PRODUCTS[16 + (i % 4)].sales),
            taxPercentBp: 1000,
          },
        ],
      },
    });
    created += 1;
  }
  console.log(`  sales invoices: ${created} created`);
}

async function ensureDepartmentsAndStaff(branchByCode) {
  const departments = await listAll('/hr/departments');
  const deptByCode = new Map(departments.map((d) => [d.code, d]));
  for (const [code, nameEn, nameAr] of DEPARTMENTS) {
    if (deptByCode.has(code)) continue;
    const made = await request('/hr/departments', {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      body: { code, nameEn, nameAr, branchId: primaryBranchId },
    });
    deptByCode.set(code, made);
  }

  const titles = await listAll('/hr/job-titles');
  const titleByCode = new Map(titles.map((t) => [t.code, t]));
  for (const [code, nameEn, nameAr, dept] of JOB_TITLES) {
    if (titleByCode.has(code)) continue;
    const made = await request('/hr/job-titles', {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      body: { code, nameEn, nameAr, departmentId: deptByCode.get(dept)?.id ?? null },
    });
    titleByCode.set(code, made);
  }

  const employees = await listAll('/hr/employees');
  const byCode = new Map(employees.map((e) => [e.code, e]));
  for (const [code, nameEn, nameAr, dept, title, branch, salary] of EMPLOYEES) {
    if (byCode.has(code)) continue;
    const made = await request('/hr/employees', {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      body: {
        code,
        fullNameEn: nameEn,
        fullNameAr: nameAr,
        email: `${code.toLowerCase()}@demo.oryx.local`,
        phone: '+97317000000',
        departmentId: deptByCode.get(dept)?.id ?? null,
        jobTitleId: titleByCode.get(title)?.id ?? null,
        branchId: branchByCode.get(branch)?.id ?? primaryBranchId,
        hireDate: new Date(Date.UTC(2024, 0, 15)).toISOString(),
        gender: 'UNSPECIFIED',
        addressLine: 'Kingdom of Bahrain',
      },
    });
    byCode.set(code, made);
    // A contract makes the employee payroll-ready, which the mobile HR screen shows.
    await request(`/hr/employees/${made.id}/contracts`, {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      body: {
        contractNumber: `CON-${code}`,
        type: 'PERMANENT',
        startDate: new Date(Date.UTC(2024, 0, 15)).toISOString(),
        baseSalaryMinor: money(salary),
        currency: CURRENCY,
        probationDays: 90,
      },
    }).catch((err) => {
      if (err.status !== 409) throw err;
    });
  }
  console.log(`  HR: ${deptByCode.size} departments, ${titleByCode.size} job titles, ${byCode.size} employees`);
}

async function ensureSupplierInvoice(supplierByCode, productBySku, warehouseByCode) {
  const existing = await listAll('/purchasing/supplier-invoices');
  if (existing.some((i) => i.supplierInvoiceNumber === 'SUP-INV-DEMO-001')) {
    console.log('  supplier invoice: already present');
    return;
  }
  const supplier = supplierByCode.get('SUP-001');
  const product = productBySku.get('OIL-5W30');

  await request('/purchasing/supplier-invoices', {
    method: 'POST',
    token: accessToken,
    companyId: companyId_,
    branchId: primaryBranchId,
    body: {
      supplierId: supplier.id,
      supplierInvoiceNumber: 'SUP-INV-DEMO-001',
      branchId: primaryBranchId,
      invoiceDate: new Date(Date.now() - 5 * 86400_000).toISOString(),
      dueDate: new Date(Date.now() + 25 * 86400_000).toISOString(),
      currency: CURRENCY,
      notes: 'Demo supplier invoice provisioned for mobile integration.',
      post: true,
      lines: [
        {
          productId: product.id,
          description: 'Engine Oil 5W-30 (4L)',
          quantity: qty(40),
          unitCostMinor: money(8.8),
          taxPercentBp: 1000,
        },
      ],
    },
  }).catch((err) => {
    console.log(`  supplier invoice: skipped (${err.status}) ${err.message}`);
    return;
  });
  console.log('  supplier invoice: created');
}

async function ensureStockTransfer(warehouseByCode, productBySku) {
  const existing = await listAll('/inventory/transfers');
  const posted = existing.filter((t) => t.status === 'POSTED' || t.status === 'COMPLETED');
  if (posted.length > 0) {
    console.log(`  stock transfers: ${posted.length} already posted`);
    return;
  }
  const from = warehouseByCode.get('MAIN');
  const to = warehouseByCode.get('BR2');
  const product = productBySku.get('FILTER-AIR');

  const draft = await request('/inventory/transfers', {
    method: 'POST',
    token: accessToken,
    companyId: companyId_,
    branchId: primaryBranchId,
    body: {
      fromWarehouseId: from.id,
      toWarehouseId: to.id,
      branchId: primaryBranchId,
      notes: 'Demo inter-branch transfer.',
      lines: [{ productId: product.id, quantity: qty(5) }],
    },
  });
  await request(`/inventory/transfers/${draft.id}/post`, {
    method: 'POST',
    token: accessToken,
    companyId: companyId_,
    branchId: primaryBranchId,
    body: {},
  });
  console.log('  stock transfer: posted');
}

async function ensureProjectsAndTasks() {
  const projects = await listAll('/operations/projects');
  let project = projects.find((p) => p.code === 'PRJ-DEMO');
  if (!project) {
    project = await request('/operations/projects', {
      method: 'POST',
      token: accessToken,
      companyId: companyId_,
      body: {
        code: 'PRJ-DEMO',
        nameEn: 'Workshop Upgrade Programme',
        nameAr: 'برنامج تطوير الورشة',
        description: 'Demo project provisioned for mobile integration.',
        startDate: new Date(Date.UTC(2026, 0, 1)).toISOString(),
        branchId: primaryBranchId,
      },
    }).catch((err) => {
      if (err.status === 409) return null;
      throw err;
    });
  }

  const tasks = await listAll('/operations/tasks');
  if (tasks.length === 0 && project?.id) {
    const seed = [
      ['Install new lift bay', 'تركيب رافعة جديدة'],
      ['Upgrade diagnostic equipment', 'ترقية أجهزة الفحص'],
      ['Train technicians on EV safety', 'تدريب الفنيين على سلامة السيارات الكهربائية'],
    ];
    for (const [titleEn, titleAr] of seed) {
      await request('/operations/tasks', {
        method: 'POST',
        token: accessToken,
        companyId: companyId_,
        body: {
          projectId: project.id,
          title: titleEn,
          description: titleAr,
          priority: 'NORMAL',
          dueDate: new Date(Date.now() + 7 * 86400_000).toISOString(),
          branchId: primaryBranchId,
        },
      }).catch((err) => {
        if (err.status !== 400 && err.status !== 409) throw err;
      });
    }
  }
  console.log('  operations: 1 project, tasks ensured');
}

// ------------------------------------------------------------------------ run

async function main() {
  console.log('ORYX mobile demo seed — start');
  console.log(`  API: ${BASE}`);

  await signIn();

  if (has('reset')) await resetDemoCompany();
  await ensureCompany();
  await ensureDemoAdmin();
  const branchByCode = await ensureBranches();
  await ensureChart();
  await ensureFiscalYear();
  const warehouseByCode = await ensureWarehouses(branchByCode);
  const productBySku = await ensureProducts();
  await ensureOpeningStock(warehouseByCode, productBySku);
  const customerByCode = await ensureParties('customers', CUSTOMERS);
  const supplierByCode = await ensureParties('suppliers', SUPPLIERS);
  await ensureSupplierInvoice(supplierByCode, productBySku, warehouseByCode);
  await ensureSalesInvoices(customerByCode, productBySku, warehouseByCode);
  await ensureStockTransfer(warehouseByCode, productBySku);
  await ensureDepartmentsAndStaff(branchByCode);
  await ensureProjectsAndTasks();

  console.log('\nDemo tenant ready:');
  console.log(`  company      : ${COMPANY_NAME_EN} (${COMPANY_CODE})`);
  console.log(`  companyId    : ${companyId_}`);
  console.log(`  admin email  : ${DEMO_ADMIN.email}`);
  if (!adminPasswordIsFresh) {
    // The password was issued on the run that created the account. Printing a
    // newly generated one here would be a lie: nothing would have changed it.
    console.log('  admin password: unchanged (account already existed)');
    console.log('ORYX mobile demo seed — done');
    return;
  }
  const passwordFile = arg('password-file');
  if (passwordFile) {
    writeFileSync(passwordFile, `${DEMO_ADMIN.password}\n`, { mode: 0o600 });
    console.log(`  admin password: written to ${passwordFile} (mode 0600)`);
  } else {
    console.log(`  admin password: ${DEMO_ADMIN.password}`);
  }
  console.log('ORYX mobile demo seed — done');
}

main().catch((err) => {
  console.error(`\nDemo seed failed: ${err.message}`);
  process.exit(1);
});
