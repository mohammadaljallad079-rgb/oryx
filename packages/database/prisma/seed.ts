/**
 * ORYX seed script.
 *
 * Creates the platform baseline required by Execution 01:
 *   - the ERP module catalog (mirrors @oryx/shared)
 *   - the permission catalog is code-defined, not stored
 *   - platform + company roles
 *   - the Super Admin account
 *   - ORYX internal group companies and branches
 *   - subscription plans
 *   - two clearly-labelled DEMO SaaS tenants so the dashboard has real rows
 *   - website/app CMS baseline records
 *
 * Every seeded record is idempotent (upsert). Demo tenants are marked in the
 * company `notes` field so they can be identified and removed.
 */

import { PrismaClient, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  BAHRAIN_SERVICE_AREAS,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  MODULES,
  PERMISSIONS,
  PLATFORM_SUPER_ADMIN_PERMISSION_CODES,
  PLANS,
  SERVICE_CATEGORIES,
  lineAmountMinor,
} from '@oryx/shared';

const prisma = new PrismaClient();

const DEMO_MARKER = 'SEED_DEMO_DATA';

/**
 * The seed is a **development and demonstration** tool. It creates a known
 * Super Admin password, two synthetic demo tenants and baseline rows that are
 * appropriate for a sandbox and dangerous in production.
 *
 * It therefore refuses to run when it believes it is pointed at production,
 * unless the operator has explicitly accepted the risk with
 * `ALLOW_SEED_IN_PRODUCTION=true`. The refusal is the default: an operator who
 * has not thought about it should not get demo tenants and a published default
 * password in their live database.
 *
 * The check is deliberately conservative about what counts as production. An
 * unrecognised environment is treated as production, because the cost of a
 * false refusal is one environment variable and the cost of a false permit is a
 * compromised deployment.
 */
function assertSeedIsAllowed(): void {
  const env = (process.env.NODE_ENV ?? '').toLowerCase();
  const explicitlyAllowed = process.env.ALLOW_SEED_IN_PRODUCTION === 'true';
  const isProductionLike = env === 'production' || env === 'staging';

  if (isProductionLike && !explicitlyAllowed) {
    console.error(
      `\nORYX seed refused: NODE_ENV is "${env}".\n\n` +
        'This script creates demo tenants and a default Super Admin password and\n' +
        'must not run against a production database.\n\n' +
        'For a production deployment, initialise the platform with:\n' +
        '  pnpm db:migrate\n' +
        '  node scripts/provision-super-admin.mjs\n\n' +
        'If this really is a disposable environment, re-run with:\n' +
        '  ALLOW_SEED_IN_PRODUCTION=true pnpm db:seed\n',
    );
    process.exit(1);
  }
}

/** Standard chart of accounts mirrored from the accounting service. */
const STANDARD_CHART: Array<{
  code: string;
  nameEn: string;
  nameAr: string;
  type: string;
  normalBalance: string;
  systemRole?: string;
}> = [
  { code: '1000', nameEn: 'Cash on hand', nameAr: 'النقدية بالصندوق', type: 'ASSET', normalBalance: 'DEBIT', systemRole: 'CASH' },
  { code: '1010', nameEn: 'Bank', nameAr: 'البنك', type: 'ASSET', normalBalance: 'DEBIT', systemRole: 'BANK' },
  { code: '1100', nameEn: 'Accounts receivable', nameAr: 'الذمم المدينة', type: 'ASSET', normalBalance: 'DEBIT', systemRole: 'AR_CONTROL' },
  { code: '1200', nameEn: 'Inventory', nameAr: 'المخزون', type: 'ASSET', normalBalance: 'DEBIT', systemRole: 'INVENTORY' },
  { code: '2000', nameEn: 'Accounts payable', nameAr: 'الذمم الدائنة', type: 'LIABILITY', normalBalance: 'CREDIT', systemRole: 'AP_CONTROL' },
  { code: '2100', nameEn: 'VAT payable (output)', nameAr: 'ضريبة القيمة المضافة المستحقة', type: 'LIABILITY', normalBalance: 'CREDIT', systemRole: 'VAT_OUTPUT' },
  { code: '2110', nameEn: 'VAT recoverable (input)', nameAr: 'ضريبة القيمة المضافة القابلة للخصم', type: 'ASSET', normalBalance: 'DEBIT', systemRole: 'VAT_INPUT' },
  { code: '3000', nameEn: 'Owner equity', nameAr: 'حقوق الملكية', type: 'EQUITY', normalBalance: 'CREDIT' },
  { code: '4000', nameEn: 'Sales revenue', nameAr: 'إيرادات المبيعات', type: 'REVENUE', normalBalance: 'CREDIT', systemRole: 'SALES_REVENUE' },
  { code: '4100', nameEn: 'Sales discounts', nameAr: 'خصومات المبيعات', type: 'REVENUE', normalBalance: 'DEBIT', systemRole: 'SALES_DISCOUNT' },
  { code: '5000', nameEn: 'Cost of goods sold', nameAr: 'تكلفة البضاعة المباعة', type: 'EXPENSE', normalBalance: 'DEBIT', systemRole: 'COGS' },
  { code: '5900', nameEn: 'Cash over / short', nameAr: 'فروق الصندوق', type: 'EXPENSE', normalBalance: 'DEBIT', systemRole: 'CASH_OVER_SHORT' },
  { code: '5910', nameEn: 'Inventory adjustment', nameAr: 'تسوية المخزون', type: 'EXPENSE', normalBalance: 'DEBIT', systemRole: 'STOCK_ADJUSTMENT' },
  { code: '5920', nameEn: 'Purchase price variance', nameAr: 'فروق أسعار الشراء', type: 'EXPENSE', normalBalance: 'DEBIT', systemRole: 'PURCHASE_PRICE_VARIANCE' },
  { code: '6000', nameEn: 'Salaries and wages expense', nameAr: 'مصروف الرواتب والأجور', type: 'EXPENSE', normalBalance: 'DEBIT', systemRole: 'SALARIES_EXPENSE' },
  { code: '2200', nameEn: 'Salaries payable', nameAr: 'الرواتب المستحقة الدفع', type: 'LIABILITY', normalBalance: 'CREDIT', systemRole: 'WAGES_PAYABLE' },
  { code: '2210', nameEn: 'Payroll deductions payable', nameAr: 'استقطاعات الرواتب المستحقة', type: 'LIABILITY', normalBalance: 'CREDIT', systemRole: 'PAYROLL_DEDUCTIONS' },
  { code: '1300', nameEn: 'Employee advances receivable', nameAr: 'سلف الموظفين', type: 'ASSET', normalBalance: 'DEBIT', systemRole: 'EMPLOYEE_ADVANCE' },
  { code: '2220', nameEn: 'Employee payable', nameAr: 'مستحقات الموظفين', type: 'LIABILITY', normalBalance: 'CREDIT', systemRole: 'EMPLOYEE_PAYABLE' },
  // Execution 04 — marketplace commissions and provider settlements
  { code: '4200', nameEn: 'Marketplace commission revenue', nameAr: 'إيرادات عمولة السوق', type: 'REVENUE', normalBalance: 'CREDIT', systemRole: 'MARKETPLACE_COMMISSION' },
  { code: '2230', nameEn: 'Service provider payable', nameAr: 'مستحقات مزودي الخدمة', type: 'LIABILITY', normalBalance: 'CREDIT', systemRole: 'PROVIDER_PAYABLE' },
];

/** Quantities are scaled by 10^4 (10000 = 1 unit). */
const DEMO_PRODUCTS = [
  { sku: 'OIL-5W30', nameEn: 'Engine oil 5W-30 (4L)', nameAr: 'زيت محرك 5W-30 (4 لتر)', unit: 'bottle', salesPriceMinor: 12500, costPriceMinor: 8800, reorderLevel: 200000, reorderQuantity: 500000, openingQuantity: 1200000 },
  { sku: 'FILTER-AIR', nameEn: 'Air filter', nameAr: 'فلتر هواء', unit: 'piece', salesPriceMinor: 6500, costPriceMinor: 4000, reorderLevel: 100000, reorderQuantity: 300000, openingQuantity: 450000 },
  { sku: 'BRAKE-PAD-F', nameEn: 'Front brake pad set', nameAr: 'طقم فحمات فرامل أمامية', unit: 'set', salesPriceMinor: 28000, costPriceMinor: 19000, reorderLevel: 80000, reorderQuantity: 200000, openingQuantity: 260000 },
  { sku: 'SVC-INSPECT', nameEn: 'Vehicle inspection service', nameAr: 'خدمة فحص مركبة', unit: 'service', salesPriceMinor: 35000, costPriceMinor: 0, reorderLevel: 0, reorderQuantity: 0, openingQuantity: 0 },
];

const DEMO_CUSTOMERS = [
  { code: 'CUST-001', nameEn: 'Al Noor Trading Est.', nameAr: 'مؤسسة النور التجارية', creditLimitMinor: 5000000 },
  { code: 'CUST-002', nameEn: 'Gulf Motors LLC', nameAr: 'خليج موتورز ذ.م.م', creditLimitMinor: 8000000 },
];

const DEMO_SUPPLIERS = [
  { code: 'SUP-001', nameEn: 'Arabian Parts Co.', nameAr: 'الشركة العربية لقطع الغيار' },
  { code: 'SUP-002', nameEn: 'Lubricants Wholesale', nameAr: 'تجارة الزيوت بالجملة' },
];


async function seedModules() {
  for (const [index, m] of MODULES.entries()) {
    await prisma.module.upsert({
      where: { key: m.key },
      update: {
        nameEn: m.nameEn,
        nameAr: m.nameAr,
        descriptionEn: m.descriptionEn,
        descriptionAr: m.descriptionAr,
        group: m.group,
        icon: m.icon,
        route: m.route,
        status: m.status,
        deliveryPhase: m.deliveryPhase,
        readPermission: m.readPermission,
        writePermission: m.writePermission ?? null,
        sortOrder: index,
      },
      create: {
        key: m.key,
        nameEn: m.nameEn,
        nameAr: m.nameAr,
        descriptionEn: m.descriptionEn,
        descriptionAr: m.descriptionAr,
        group: m.group,
        icon: m.icon,
        route: m.route,
        status: m.status,
        deliveryPhase: m.deliveryPhase,
        readPermission: m.readPermission,
        writePermission: m.writePermission ?? null,
        sortOrder: index,
      },
    });
  }
  console.log(`  modules: ${MODULES.length} upserted`);
}

async function seedPlans() {
  for (const plan of PLANS) {
    const record = await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        nameEn: plan.nameEn,
        nameAr: plan.nameAr,
        descriptionEn: plan.descriptionEn,
        descriptionAr: plan.descriptionAr,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        trialDays: plan.trialDays,
        maxCompanies: plan.maxCompanies,
        maxBranches: plan.maxBranches,
        maxUsers: plan.maxUsers,
        storageMb: plan.storageMb,
        apiRequestsPerMonth: plan.apiRequestsPerMonth,
      },
      create: {
        code: plan.code,
        nameEn: plan.nameEn,
        nameAr: plan.nameAr,
        descriptionEn: plan.descriptionEn,
        descriptionAr: plan.descriptionAr,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        trialDays: plan.trialDays,
        maxCompanies: plan.maxCompanies,
        maxBranches: plan.maxBranches,
        maxUsers: plan.maxUsers,
        storageMb: plan.storageMb,
        apiRequestsPerMonth: plan.apiRequestsPerMonth,
      },
    });

    for (const moduleKey of plan.licensedModules) {
      await prisma.planModule.upsert({
        where: { planId_moduleKey: { planId: record.id, moduleKey } },
        update: {},
        create: { planId: record.id, moduleKey },
      });
    }
    // Remove modules that are no longer part of the plan definition.
    await prisma.planModule.deleteMany({
      where: { planId: record.id, moduleKey: { notIn: plan.licensedModules } },
    });
  }
  console.log(`  plans: ${PLANS.length} upserted`);
}

/**
 * The platform super admin role carries the whole catalog.
 *
 * The list itself lives in `@oryx/shared` (`PLATFORM_SUPER_ADMIN_PERMISSION_CODES`)
 * so the seed, the production bootstrap and the repair script all read one
 * definition. `resolveEffectivePermissions` returns only the PLATFORM-scope
 * codes while the principal has no tenant context, and adds the company-scope
 * codes (gated by the selected company's entitlements) once a company is
 * selected. Granting the full catalog here is what lets one role serve both
 * modes without a second role, and without granting anything the selected
 * tenant is not licensed for.
 */
const PLATFORM_SUPER_ADMIN_PERMISSIONS = PLATFORM_SUPER_ADMIN_PERMISSION_CODES;

const COMPANY_ADMIN_PERMISSIONS = PERMISSIONS.filter(
  (p) => p.scope !== 'PLATFORM' && p.delegable,
).map((p) => p.code);

const BRANCH_MANAGER_PERMISSIONS = [
  'company.read',
  'company.branch.read',
  'company.user.read',
  'company.role.read',
  'company.subscription.read',
  'branch.read',
  'branch.user.read',
  'branch.report.read',
  'erp.dashboard.read',
  'erp.branch.manage',
  'erp.reports.read',
];

const STAFF_VIEWER_PERMISSIONS = [
  'company.read',
  'company.branch.read',
  'branch.read',
  'erp.dashboard.read',
];

async function seedPlatformRoles() {
  // A platform role has `companyId = NULL`. The compound unique on
  // (companyId, code) cannot express that: Postgres treats NULL as distinct, so
  // an upsert keyed on a sentinel value matches nothing and inserts a duplicate
  // row on every run. Resolve the row with findFirst and update it, which is the
  // only idempotent form for a nullable key.
  const existing = await prisma.role.findFirst({
    where: { companyId: null, code: 'platform_super_admin' },
  });
  const role = existing
    ? await prisma.role.update({
        where: { id: existing.id },
        data: { isPlatform: true, isSystem: true },
      })
    : await prisma.role.create({
        data: {
          code: 'platform_super_admin',
          nameEn: 'Platform Super Admin',
          nameAr: 'مدير المنصة',
          descriptionEn: 'Full platform governance across every company and tenant.',
          isSystem: true,
          isPlatform: true,
        },
      });

  // Reconcile rather than only add. An upsert-only loop cannot repair a role
  // that already drifted, and it keeps codes the catalogue has removed. The
  // same two-directional sync runs in production via
  // scripts/lib/platform-role.mjs, from the same catalogue constant.
  const expected = new Set(PLATFORM_SUPER_ADMIN_PERMISSIONS);
  const current = (
    await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionCode: true },
    })
  ).map((p) => p.permissionCode);

  const revoke = current.filter((code) => !expected.has(code));
  if (revoke.length > 0) {
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionCode: { in: revoke } },
    });
  }
  for (const code of PLATFORM_SUPER_ADMIN_PERMISSIONS) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionCode: { roleId: role.id, permissionCode: code } },
      update: {},
      create: { roleId: role.id, permissionCode: code },
    });
  }
  return role;
}

const COMPANY_ROLE_TEMPLATES = [
  {
    code: 'company_admin',
    nameEn: 'Company Administrator',
    nameAr: 'مدير الشركة',
    descriptionEn: 'Full administration of the company within plan entitlements.',
    permissions: COMPANY_ADMIN_PERMISSIONS,
  },
  {
    code: 'branch_manager',
    nameEn: 'Branch Manager',
    nameAr: 'مدير الفرع',
    descriptionEn: 'Manages a single branch and its staff.',
    permissions: BRANCH_MANAGER_PERMISSIONS,
  },
  {
    code: 'staff_viewer',
    nameEn: 'Staff (read-only)',
    nameAr: 'موظف (قراءة فقط)',
    descriptionEn: 'Read-only access to company and branch information.',
    permissions: STAFF_VIEWER_PERMISSIONS,
  },
];

async function ensureCompanyRoles(companyId: string) {
  const roles: Record<string, string> = {};
  for (const tpl of COMPANY_ROLE_TEMPLATES) {
    const role = await prisma.role.upsert({
      where: { companyId_code: { companyId, code: tpl.code } },
      update: {
        nameEn: tpl.nameEn,
        nameAr: tpl.nameAr,
        descriptionEn: tpl.descriptionEn,
      },
      create: {
        companyId,
        code: tpl.code,
        nameEn: tpl.nameEn,
        nameAr: tpl.nameAr,
        descriptionEn: tpl.descriptionEn,
        isSystem: true,
      },
    });
    roles[tpl.code] = role.id;
    for (const code of tpl.permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionCode: { roleId: role.id, permissionCode: code } },
        update: {},
        create: { roleId: role.id, permissionCode: code },
      });
    }
  }
  return roles;
}

async function seedUsers() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local';
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const superAdmin = await prisma.user.upsert({
    where: { email },
    update: { isSuperAdmin: true, status: 'ACTIVE' },
    create: {
      email,
      passwordHash,
      fullNameEn: 'Platform Super Admin',
      fullNameAr: 'مدير المنصة',
      status: 'ACTIVE',
      isSuperAdmin: true,
      preferredLocale: 'ar',
      preferredTheme: 'dark',
    },
  });
  console.log(`  super admin: ${email}`);
  return superAdmin;
}

interface CompanySpec {
  code: string;
  nameEn: string;
  nameAr: string;
  type: 'INTERNAL' | 'SAAS_TENANT';
  industry: string;
  parentCode?: string;
  demo?: boolean;
  branches: Array<{ code: string; nameEn: string; nameAr: string; city: string }>;
}

const COMPANIES: CompanySpec[] = [
  {
    code: 'ORYX-HOLDING',
    nameEn: 'ORYX Holding',
    nameAr: 'أوريكس القابضة',
    type: 'INTERNAL',
    industry: 'Holding',
    branches: [{ code: 'HQ', nameEn: 'Head Office', nameAr: 'المقر الرئيسي', city: 'Riyadh' }],
  },
  {
    code: 'ORYX-AUTO',
    nameEn: 'ORYX Auto Services',
    nameAr: 'أوريكس لخدمات السيارات',
    type: 'INTERNAL',
    industry: 'Automotive Services',
    parentCode: 'ORYX-HOLDING',
    branches: [
      { code: 'RUH-01', nameEn: 'Riyadh North Workshop', nameAr: 'ورشة شمال الرياض', city: 'Riyadh' },
      { code: 'JED-01', nameEn: 'Jeddah Inspection Center', nameAr: 'مركز فحص جدة', city: 'Jeddah' },
    ],
  },
  {
    code: 'ORYX-REALESTATE',
    nameEn: 'ORYX Real Estate',
    nameAr: 'أوريكس العقارية',
    type: 'INTERNAL',
    industry: 'Real Estate',
    parentCode: 'ORYX-HOLDING',
    branches: [{ code: 'RUH-01', nameEn: 'Riyadh Office', nameAr: 'مكتب الرياض', city: 'Riyadh' }],
  },
  {
    code: 'ORYX-LOGISTICS',
    nameEn: 'ORYX Logistics',
    nameAr: 'أوريكس للخدمات اللوجستية',
    type: 'INTERNAL',
    industry: 'Logistics',
    parentCode: 'ORYX-HOLDING',
    branches: [{ code: 'DMM-01', nameEn: 'Dammam Hub', nameAr: 'مركز الدمام', city: 'Dammam' }],
  },
  {
    code: 'DEMO-ALNOOR',
    nameEn: 'Al Noor Trading (Demo)',
    nameAr: 'النور للتجارة (تجريبي)',
    type: 'SAAS_TENANT',
    industry: 'Retail',
    demo: true,
    branches: [
      { code: 'MAIN', nameEn: 'Main Showroom', nameAr: 'المعرض الرئيسي', city: 'Riyadh' },
      { code: 'BR-02', nameEn: 'Olaya Branch', nameAr: 'فرع العليا', city: 'Riyadh' },
    ],
  },
  {
    code: 'DEMO-GULFAUTO',
    nameEn: 'Gulf Auto Care (Demo)',
    nameAr: 'الخليج لصيانة السيارات (تجريبي)',
    type: 'SAAS_TENANT',
    industry: 'Automotive Services',
    demo: true,
    branches: [
      { code: 'MAIN', nameEn: 'Main Center', nameAr: 'المركز الرئيسي', city: 'Jeddah' },
      { code: 'BR-02', nameEn: 'Industrial Area Branch', nameAr: 'فرع المنطقة الصناعية', city: 'Jeddah' },
      { code: 'BR-03', nameEn: 'Makkah Branch', nameAr: 'فرع مكة', city: 'Makkah' },
    ],
  },
];

async function seedCompanies(superAdminId: string) {
  const idByCode = new Map<string, string>();

  for (const spec of COMPANIES) {
    const notes = spec.demo ? `${DEMO_MARKER}: synthetic tenant for dashboard demonstration` : null;
    const company = await prisma.company.upsert({
      where: { code: spec.code },
      update: {
        nameEn: spec.nameEn,
        nameAr: spec.nameAr,
        type: spec.type,
        industry: spec.industry,
        status: 'ACTIVE',
        notes,
      },
      create: {
        code: spec.code,
        nameEn: spec.nameEn,
        nameAr: spec.nameAr,
        legalNameEn: `${spec.nameEn} Ltd.`,
        type: spec.type,
        industry: spec.industry,
        status: 'ACTIVE',
        countryCode: DEFAULT_COUNTRY_CODE,
        currency: DEFAULT_CURRENCY,
        notes,
      },
    });
    idByCode.set(spec.code, company.id);

    for (const b of spec.branches) {
      await prisma.branch.upsert({
        where: { companyId_code: { companyId: company.id, code: b.code } },
        update: { nameEn: b.nameEn, nameAr: b.nameAr, city: b.city, isActive: true },
        create: {
          companyId: company.id,
          code: b.code,
          nameEn: b.nameEn,
          nameAr: b.nameAr,
          city: b.city,
          countryCode: DEFAULT_COUNTRY_CODE,
          isActive: true,
        },
      });
    }

    await ensureCompanyRoles(company.id);
  }

  // Parent/subsidiary relationships.
  for (const spec of COMPANIES) {
    if (!spec.parentCode) continue;
    await prisma.company.update({
      where: { code: spec.code },
      data: { parentCompanyId: idByCode.get(spec.parentCode) ?? null },
    });
  }

  console.log(`  companies: ${COMPANIES.length} upserted (2 marked ${DEMO_MARKER})`);
  return idByCode;
}

async function seedSubscriptions(idByCode: Map<string, string>) {
  // Only SaaS tenants carry a subscription. An ORYX internal company (type
  // `INTERNAL`) belongs to the group and is governed by the Platform Super
  // Admin, so it is never plan-gated: `EntitlementService.forCompany` resolves
  // every catalogued module and no limits for it. Seeding a plan against an
  // internal company made it behave like a customer, which is the conflation
  // the two-model rule forbids.
  const assignments: Array<{ companyCode: string; planCode: string; status: 'ACTIVE' | 'TRIAL'; period: 'MONTHLY' | 'ANNUAL' }> = [
    { companyCode: 'DEMO-ALNOOR', planCode: 'professional', status: 'ACTIVE', period: 'MONTHLY' },
    { companyCode: 'DEMO-GULFAUTO', planCode: 'enterprise', status: 'TRIAL', period: 'MONTHLY' },
  ];

  for (const a of assignments) {
    const companyId = idByCode.get(a.companyCode);
    if (!companyId) continue;
    const plan = await prisma.plan.findUnique({ where: { code: a.planCode } });
    if (!plan) continue;
    const planModules = await prisma.planModule.findMany({ where: { planId: plan.id } });
    const licensedModules = planModules.map((pm) => pm.moduleKey);

    const existing = await prisma.subscription.findFirst({ where: { companyId } });
    const price = a.period === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + (a.period === 'ANNUAL' ? 12 : 1));

    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          planId: plan.id,
          status: a.status,
          billingPeriod: a.period,
          price,
          licensedModules,
          currentPeriodEnd: periodEnd,
        },
      });
    } else {
      const created = await prisma.subscription.create({
        data: {
          companyId,
          planId: plan.id,
          status: a.status,
          billingPeriod: a.period,
          price,
          currency: plan.currency,
          currentPeriodEnd: periodEnd,
          licensedModules,
        },
      });
      await prisma.subscriptionEvent.create({
        data: {
          subscriptionId: created.id,
          type: 'CREATED',
          toStatus: a.status,
          toPlanId: plan.id,
          amount: price,
          currency: plan.currency,
          note: 'Seeded initial subscription.',
        },
      });
    }
  }

  // Repair any internal company that a previous seed gave a subscription. The
  // rows are deleted rather than updated: an internal company is not a paying
  // customer, and leaving a dormant plan row behind would let a later query
  // mistake it for one.
  const internal = await prisma.company.findMany({
    where: { type: 'INTERNAL' },
    select: { id: true, code: true },
  });
  let repaired = 0;
  for (const company of internal) {
    const removed = await prisma.subscription.deleteMany({ where: { companyId: company.id } });
    repaired += removed.count;
  }

  console.log(`  subscriptions: ${assignments.length} upserted, ${repaired} internal-company rows removed`);
}

async function seedCompanyAdmin(
  superAdminId: string,
  idByCode: Map<string, string>,
  email: string,
  companyCode: string,
  roleCode: string,
) {
  const companyId = idByCode.get(companyCode);
  if (!companyId) return;
  const role = await prisma.role.findFirst({ where: { companyId, code: roleCode } });
  if (!role) return;

  const passwordHash = await argon2.hash(process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026', {
    type: argon2.argon2id,
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { status: 'ACTIVE' },
    create: {
      email,
      passwordHash,
      fullNameEn: `${companyCode} Administrator`,
      fullNameAr: `مدير ${companyCode}`,
      status: 'ACTIVE',
      preferredLocale: 'ar',
      preferredTheme: 'dark',
    },
  });

  await prisma.membership.upsert({
    where: { userId_companyId: { userId: user.id, companyId } },
    update: { roleId: role.id, isActive: true, invitedById: superAdminId },
    create: {
      userId: user.id,
      companyId,
      roleId: role.id,
      isActive: true,
      invitedById: superAdminId,
    },
  });
}

async function seedCompanyAdmins(superAdminId: string, idByCode: Map<string, string>) {
  await seedCompanyAdmin(superAdminId, idByCode, 'admin@oryx-auto.local', 'ORYX-AUTO', 'company_admin');
  await seedCompanyAdmin(superAdminId, idByCode, 'admin@demo-alnoor.local', 'DEMO-ALNOOR', 'company_admin');
  console.log('  company admins: 2 upserted');
}

async function seedCms() {
  const pages: Array<Pick<Prisma.CmsPageCreateInput, 'slug' | 'locale' | 'title' | 'body' | 'status'>> = [
    { slug: 'home', locale: 'ar', title: 'الرئيسية', body: 'محتوى الصفحة الرئيسية لموقع أوريكس.', status: 'PUBLISHED' },
    { slug: 'home', locale: 'en', title: 'Home', body: 'ORYX website home page content.', status: 'PUBLISHED' },
    { slug: 'about', locale: 'ar', title: 'من نحن', body: 'محتوى صفحة من نحن.', status: 'DRAFT' },
    { slug: 'about', locale: 'en', title: 'About us', body: 'About us page content.', status: 'DRAFT' },
    { slug: 'privacy-policy', locale: 'ar', title: 'سياسة الخصوصية', body: 'سياسة الخصوصية.', status: 'PUBLISHED' },
    { slug: 'privacy-policy', locale: 'en', title: 'Privacy Policy', body: 'Privacy policy.', status: 'PUBLISHED' },
  ];
  for (const p of pages) {
    await prisma.cmsPage.upsert({
      where: { slug_locale: { slug: p.slug, locale: p.locale } },
      update: { title: p.title, body: p.body, status: p.status },
      create: p,
    });
  }

  const banners = [
    { placement: 'app_home', locale: 'ar' as const, title: 'فحص سيارتك الآن', subtitle: 'احجز موعد فحص معتمد', sortOrder: 1 },
    { placement: 'app_home', locale: 'en' as const, title: 'Inspect your vehicle', subtitle: 'Book a certified inspection', sortOrder: 1 },
    { placement: 'web_home', locale: 'ar' as const, title: 'منظومة أوريكس المتكاملة', subtitle: 'حلول متكاملة للشركات', sortOrder: 1 },
    { placement: 'web_home', locale: 'en' as const, title: 'The ORYX integrated ecosystem', subtitle: 'Enterprise solutions', sortOrder: 1 },
  ];
  for (const b of banners) {
    const existing = await prisma.cmsBanner.findFirst({
      where: { placement: b.placement, locale: b.locale, title: b.title },
    });
    if (existing) {
      await prisma.cmsBanner.update({ where: { id: existing.id }, data: b });
    } else {
      await prisma.cmsBanner.create({ data: b });
    }
  }

  const flags = [
    { key: 'consumer_app_enabled', nameEn: 'Consumer App', nameAr: 'تطبيق العملاء', enabled: false, rolloutPercentage: 0, audience: 'all', description: 'Gates the consumer mobile application. Not implemented in Execution 01.' },
    { key: 'marketplace_enabled', nameEn: 'Spare Parts Marketplace', nameAr: 'سوق قطع الغيار', enabled: false, rolloutPercentage: 0, audience: 'all', description: 'Spare parts marketplace ordering. Planned.' },
    { key: 'inspection_booking_enabled', nameEn: 'Inspection Booking', nameAr: 'حجز الفحص', enabled: false, rolloutPercentage: 0, audience: 'all', description: 'Consumer inspection booking. Planned.' },
    { key: 'recovery_service_enabled', nameEn: 'Recovery Service', nameAr: 'خدمة الإنقاذ', enabled: false, rolloutPercentage: 0, audience: 'all', description: 'Roadside recovery dispatch. Planned.' },
  ];
  for (const f of flags) {
    await prisma.featureFlag.upsert({ where: { key: f.key }, update: f, create: f });
  }

  const versions = [
    { platform: 'IOS' as const, version: '0.1.0', buildNumber: '1', minSupportedVersion: '0.1.0', isActive: true, releaseNotes: 'Placeholder release entry. No mobile build exists yet.' },
    { platform: 'ANDROID' as const, version: '0.1.0', buildNumber: '1', minSupportedVersion: '0.1.0', isActive: true, releaseNotes: 'Placeholder release entry. No mobile build exists yet.' },
  ];
  for (const v of versions) {
    await prisma.appVersion.upsert({
      where: { platform_version: { platform: v.platform, version: v.version } },
      update: v,
      create: v,
    });
  }

  // The catalogue comes from @oryx/shared so the seed, the CMS, the provider
  // directory and both clients agree on one key space. Descriptions and sort
  // order are kept in step with the code definition.
  const categories = SERVICE_CATEGORIES.map((c) => ({
    key: c.key,
    nameEn: c.nameEn,
    nameAr: c.nameAr,
    domain: c.domain,
    sortOrder: c.sortOrder,
    descriptionEn: c.descEn,
    descriptionAr: c.descAr,
  }));
  for (const c of categories) {
    await prisma.serviceCategory.upsert({ where: { key: c.key }, update: c, create: c });
  }

  const templates = [
    { key: 'invitation', locale: 'ar' as const, channel: 'email', subject: 'دعوة للانضمام إلى أوريكس', body: 'تمت دعوتك للانضمام إلى {{company}}. رمز الدعوة: {{token}}' },
    { key: 'invitation', locale: 'en' as const, channel: 'email', subject: 'Invitation to join ORYX', body: 'You have been invited to join {{company}}. Invitation token: {{token}}' },
    { key: 'subscription_expiring', locale: 'ar' as const, channel: 'email', subject: 'اشتراكك على وشك الانتهاء', body: 'ينتهي اشتراك {{company}} في {{date}}.' },
    { key: 'subscription_expiring', locale: 'en' as const, channel: 'email', subject: 'Your subscription is expiring', body: 'The subscription for {{company}} expires on {{date}}.' },
  ];
  for (const t of templates) {
    await prisma.notificationTemplate.upsert({
      where: { key_locale: { key: t.key, locale: t.locale } },
      update: t,
      create: t,
    });
  }

  await prisma.platformSetting.upsert({
    where: { key: 'branding' },
    update: { value: { nameEn: 'ORYX', nameAr: 'أوريكس', primaryColor: '#d4af37', navy: '#00162b' } },
    create: { key: 'branding', value: { nameEn: 'ORYX', nameAr: 'أوريكس', primaryColor: '#d4af37', navy: '#00162b' } },
  });

  console.log('  cms: pages, banners, flags, versions, categories, templates seeded');
}

async function seedAuditBaseline(superAdminId: string, idByCode: Map<string, string>) {
  const count = await prisma.auditLog.count();
  if (count > 0) return;
  const holdingId = idByCode.get('ORYX-HOLDING');
  await prisma.auditLog.create({
    data: {
      actorUserId: superAdminId,
      companyId: holdingId ?? null,
      action: 'platform.seed',
      targetType: 'PLATFORM',
      targetId: null,
      summary: 'Platform baseline seeded (modules, plans, companies, CMS).',
      metadata: { seedVersion: 1 },
    },
  });
}

/**
 * Execution 02 — seed a working ERP baseline for every company that has an
 * active subscription, so the operational modules have real reference data.
 *
 * Idempotent: accounts, the fiscal year, warehouse, products, customers and
 * suppliers are upserted by their natural keys.
 */
async function seedErpBaseline(idByCode: Map<string, string>, superAdminId: string) {
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' } });
  let accounts = 0;
  let years = 0;
  let warehouses = 0;
  let products = 0;
  let customers = 0;
  let suppliers = 0;

  for (const company of companies) {
    // Upsert every standard account by code so a chart that predates a new
    // system account is completed without disturbing custom accounts.
    for (const a of STANDARD_CHART) {
      const existing = await prisma.account.findUnique({
        where: { companyId_code: { companyId: company.id, code: a.code } },
      });
      if (existing) {
        if (!existing.systemRole && a.systemRole) {
          await prisma.account.update({ where: { id: existing.id }, data: { systemRole: a.systemRole } });
        }
        continue;
      }
      await prisma.account.create({
        data: {
          companyId: company.id,
          code: a.code,
          nameEn: a.nameEn,
          nameAr: a.nameAr,
          type: a.type as never,
          normalBalance: a.normalBalance as never,
          isPostable: true,
          isSystem: true,
          systemRole: a.systemRole ?? null,
          currency: company.currency,
        },
      });
      accounts += 1;
    }

    // One open fiscal year covering the current calendar year.
    const year = new Date().getUTCFullYear();
    const code = String(year);
    const existingYear = await prisma.fiscalYear.findUnique({
      where: { companyId_code: { companyId: company.id, code } },
    });
    if (!existingYear) {
      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      const periods = buildSeedPeriods(start, end);
      await prisma.fiscalYear.create({
        data: {
          companyId: company.id,
          code,
          startDate: start,
          endDate: end,
          periods: {
            create: periods.map((p, i) => ({
              companyId: company.id,
              periodNumber: i + 1,
              nameEn: p.nameEn,
              nameAr: p.nameAr,
              startDate: p.start,
              endDate: p.end,
              status: 'OPEN',
            })),
          },
        },
      });
      years += 1;
    }

    const branch = await prisma.branch.findFirst({ where: { companyId: company.id } });
    const wh = await prisma.warehouse.upsert({
      where: { companyId_code: { companyId: company.id, code: 'MAIN' } },
      update: {},
      create: {
        companyId: company.id,
        branchId: branch?.id ?? null,
        code: 'MAIN',
        nameEn: 'Main warehouse',
        nameAr: 'المستودع الرئيسي',
      },
    });
    warehouses += 1;

    for (const p of DEMO_PRODUCTS) {
      await prisma.product.upsert({
        where: { companyId_sku: { companyId: company.id, sku: p.sku } },
        update: {},
        create: {
          companyId: company.id,
          sku: p.sku,
          nameEn: p.nameEn,
          nameAr: p.nameAr,
          unit: p.unit,
          salesPriceMinor: p.salesPriceMinor,
          costPriceMinor: p.costPriceMinor,
          taxRateBp: 1500,
          reorderLevel: p.reorderLevel,
          reorderQuantity: p.reorderQuantity,
        },
      });
      products += 1;
    }

    for (const c of DEMO_CUSTOMERS) {
      await prisma.customer.upsert({
        where: { companyId_code: { companyId: company.id, code: c.code } },
        update: {},
        create: {
          companyId: company.id,
          code: c.code,
          nameEn: c.nameEn,
          nameAr: c.nameAr,
          creditLimitMinor: c.creditLimitMinor,
          paymentTermsDays: 30,
        },
      });
      customers += 1;
    }

    for (const s of DEMO_SUPPLIERS) {
      await prisma.supplier.upsert({
        where: { companyId_code: { companyId: company.id, code: s.code } },
        update: {},
        create: {
          companyId: company.id,
          code: s.code,
          nameEn: s.nameEn,
          nameAr: s.nameAr,
          paymentTermsDays: 30,
        },
      });
      suppliers += 1;
    }

    // Opening stock so the warehouse is not empty.
    for (const p of DEMO_PRODUCTS) {
      const product = await prisma.product.findUnique({
        where: { companyId_sku: { companyId: company.id, sku: p.sku } },
      });
      if (!product) continue;
      const level = await prisma.stockLevel.findUnique({
        where: { warehouseId_productId: { warehouseId: wh.id, productId: product.id } },
      });
      if (level) continue;
      const qty = p.openingQuantity;
      await prisma.stockLevel.create({
        data: {
          companyId: company.id,
          warehouseId: wh.id,
          productId: product.id,
          quantity: qty,
          averageCostMinor: p.costPriceMinor,
        },
      });
      await prisma.stockMovement.create({
        data: {
          companyId: company.id,
          warehouseId: wh.id,
          productId: product.id,
          movementType: 'OPENING',
          quantity: qty,
          unitCostMinor: p.costPriceMinor,
          totalCostMinor: lineAmountMinor(qty, p.costPriceMinor),
          balanceAfter: qty,
          source: 'OPENING_BALANCE',
          memo: 'Seeded opening stock',
          occurredAt: new Date(),
          createdById: superAdminId,
        },
      });
    }
  }

  console.log(
    `  erp baseline: ${accounts} accounts, ${years} fiscal years, ${warehouses} warehouses, ` +
      `${products} products, ${customers} customers, ${suppliers} suppliers`,
  );
}

function buildSeedPeriods(start: Date, end: Date) {
  const periods: Array<{ nameEn: string; nameAr: string; start: Date; end: Date }> = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const periodStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    periods.push({
      nameEn: cursor.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      nameAr: cursor.toLocaleString('ar-SA', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      start: periodStart < start ? start : periodStart,
      end: monthEnd > end ? end : monthEnd,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periods;
}

/**
 * Execution 03 — seed an operational baseline (HR, CRM, operations, automotive)
 * for every company that has an active subscription, so the new modules have
 * real reference data. Idempotent by natural key.
 */
async function seedExecution03Baseline(idByCode: Map<string, string>, superAdminId: string) {
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' } });
  let departments = 0;
  let jobTitles = 0;
  let employees = 0;
  let leaveTypes = 0;
  let shifts = 0;
  let leadSources = 0;
  let pipelines = 0;
  let inspectionServices = 0;
  let bays = 0;
  let providers = 0;
  let bookingResources = 0;

  for (const company of companies) {
    const branch = await prisma.branch.findFirst({ where: { companyId: company.id } });

    // Departments and job titles.
    const deptSpecs = [
      { code: 'OPS', nameEn: 'Operations', nameAr: 'العمليات' },
      { code: 'FIN', nameEn: 'Finance', nameAr: 'المالية' },
      { code: 'WORKSHOP', nameEn: 'Workshop', nameAr: 'الورشة' },
    ];
    const deptIds: Record<string, string> = {};
    for (const d of deptSpecs) {
      const dept = await prisma.department.upsert({
        where: { companyId_code: { companyId: company.id, code: d.code } },
        update: {},
        create: { companyId: company.id, code: d.code, nameEn: d.nameEn, nameAr: d.nameAr, branchId: branch?.id ?? null },
      });
      deptIds[d.code] = dept.id;
      departments += 1;
    }

    const titleSpecs = [
      { code: 'TECH', nameEn: 'Technician', nameAr: 'فني', dept: 'WORKSHOP' },
      { code: 'SVCADV', nameEn: 'Service Advisor', nameAr: 'مستشار خدمة', dept: 'OPS' },
      { code: 'ACCT', nameEn: 'Accountant', nameAr: 'محاسب', dept: 'FIN' },
    ];
    const titleIds: Record<string, string> = {};
    for (const jt of titleSpecs) {
      const title = await prisma.jobTitle.upsert({
        where: { companyId_code: { companyId: company.id, code: jt.code } },
        update: {},
        create: { companyId: company.id, code: jt.code, nameEn: jt.nameEn, nameAr: jt.nameAr, departmentId: deptIds[jt.dept] },
      });
      titleIds[jt.code] = title.id;
      jobTitles += 1;
    }

    // Employees.
    const employeeSpecs = [
      { code: 'EMP-001', fullNameEn: 'Ahmed Al Harbi', fullNameAr: 'أحمد الحربي', title: 'TECH', basic: 600000 },
      { code: 'EMP-002', fullNameEn: 'Sara Al Otaibi', fullNameAr: 'سارة العتيبي', title: 'SVCADV', basic: 700000 },
      { code: 'EMP-003', fullNameEn: 'Omar Nasser', fullNameAr: 'عمر ناصر', title: 'ACCT', basic: 800000 },
    ];
    for (const e of employeeSpecs) {
      const existing = await prisma.employee.findUnique({ where: { companyId_code: { companyId: company.id, code: e.code } } });
      if (existing) continue;
      const employee = await prisma.employee.create({
        data: {
          companyId: company.id,
          code: e.code,
          fullNameEn: e.fullNameEn,
          fullNameAr: e.fullNameAr,
          jobTitleId: titleIds[e.title],
          departmentId: deptIds[e.title === 'TECH' ? 'WORKSHOP' : e.title === 'ACCT' ? 'FIN' : 'OPS'],
          branchId: branch?.id ?? null,
          status: 'ACTIVE',
          hireDate: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
        },
      });
      // Effective salary structure with a housing allowance.
      await prisma.salaryStructure.create({
        data: {
          companyId: company.id,
          employeeId: employee.id,
          effectiveFrom: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
          basicMinor: e.basic,
          components: {
            create: [
              { companyId: company.id, type: 'ALLOWANCE', code: 'HOUSING', nameEn: 'Housing allowance', nameAr: 'بدل سكن', isPercentage: true, percentBp: 2500, sortOrder: 0 },
            ],
          },
        },
      });
      await prisma.employeeLifecycle.create({
        data: {
          companyId: company.id,
          employeeId: employee.id,
          type: 'ONBOARDING',
          status: 'COMPLETED',
          completedAt: new Date(),
          items: { create: [{ label: 'Contract on file', isDone: true, sortOrder: 0 }, { label: 'Access issued', isDone: true, sortOrder: 1 }] },
        },
      });
      employees += 1;
    }

    // Leave types.
    const leaveSpecs = [
      { code: 'ANNUAL', nameEn: 'Annual leave', nameAr: 'إجازة سنوية', days: 3000 },
      { code: 'SICK', nameEn: 'Sick leave', nameAr: 'إجازة مرضية', days: 1500 },
    ];
    for (const l of leaveSpecs) {
      await prisma.leaveType.upsert({
        where: { companyId_code: { companyId: company.id, code: l.code } },
        update: {},
        create: { companyId: company.id, code: l.code, nameEn: l.nameEn, nameAr: l.nameAr, annualEntitlementDays: l.days },
      });
      leaveTypes += 1;
    }

    // Shifts.
    await prisma.shift.upsert({
      where: { companyId_code: { companyId: company.id, code: 'DAY' } },
      update: {},
      create: { companyId: company.id, code: 'DAY', nameEn: 'Day shift', nameAr: 'الوردية النهارية', startTime: '08:00', endTime: '17:00', breakMinutes: 60 },
    });
    shifts += 1;

    // CRM lead sources and a default pipeline.
    for (const s of [
      { code: 'WEB', nameEn: 'Website', nameAr: 'الموقع' },
      { code: 'WALKIN', nameEn: 'Walk-in', nameAr: 'حضور مباشر' },
      { code: 'REFERRAL', nameEn: 'Referral', nameAr: 'توصية' },
    ]) {
      await prisma.leadSource.upsert({ where: { companyId_code: { companyId: company.id, code: s.code } }, update: {}, create: { companyId: company.id, code: s.code, nameEn: s.nameEn, nameAr: s.nameAr } });
      leadSources += 1;
    }
    const pipeline = await prisma.pipeline.upsert({
      where: { companyId_code: { companyId: company.id, code: 'DEFAULT' } },
      update: {},
      create: { companyId: company.id, code: 'DEFAULT', nameEn: 'Default pipeline', nameAr: 'المسار الافتراضي', isDefault: true },
    });
    if ((await prisma.pipelineStage.count({ where: { pipelineId: pipeline.id } })) === 0) {
      await prisma.pipelineStage.createMany({
        data: [
          { companyId: company.id, pipelineId: pipeline.id, code: 'NEW', nameEn: 'New', nameAr: 'جديد', sortOrder: 1, probabilityBp: 1000 },
          { companyId: company.id, pipelineId: pipeline.id, code: 'QUALIFIED', nameEn: 'Qualified', nameAr: 'مؤهل', sortOrder: 2, probabilityBp: 3000 },
          { companyId: company.id, pipelineId: pipeline.id, code: 'PROPOSAL', nameEn: 'Proposal', nameAr: 'عرض', sortOrder: 3, probabilityBp: 6000 },
          { companyId: company.id, pipelineId: pipeline.id, code: 'WON', nameEn: 'Won', nameAr: 'مكسوب', sortOrder: 4, probabilityBp: 10000, isWon: true },
          { companyId: company.id, pipelineId: pipeline.id, code: 'LOST', nameEn: 'Lost', nameAr: 'مفقود', sortOrder: 5, probabilityBp: 0, isLost: true },
        ],
      });
    }
    pipelines += 1;

    // Inspection services with a checklist.
    const svcSpecs = [
      { code: 'BASIC', nameEn: 'Basic vehicle inspection', nameAr: 'فحص مركبة أساسي', price: 25000 },
      { code: 'FULL', nameEn: 'Comprehensive inspection', nameAr: 'فحص شامل', price: 45000 },
    ];
    for (const s of svcSpecs) {
      const service = await prisma.inspectionService.upsert({
        where: { companyId_code: { companyId: company.id, code: s.code } },
        update: {},
        create: { companyId: company.id, code: s.code, nameEn: s.nameEn, nameAr: s.nameAr, priceMinor: s.price, taxPercentBp: 1500 },
      });
      if ((await prisma.inspectionChecklistItem.count({ where: { serviceId: service.id } })) === 0) {
        await prisma.inspectionChecklistItem.createMany({
          data: [
            { companyId: company.id, serviceId: service.id, code: 'BRAKES', labelEn: 'Brakes', labelAr: 'الفرامل', category: 'SAFETY', sortOrder: 0 },
            { companyId: company.id, serviceId: service.id, code: 'TIRES', labelEn: 'Tyres', labelAr: 'الإطارات', category: 'SAFETY', sortOrder: 1 },
            { companyId: company.id, serviceId: service.id, code: 'LIGHTS', labelEn: 'Lights', labelAr: 'الإضاءة', category: 'ELECTRICAL', sortOrder: 2 },
            { companyId: company.id, serviceId: service.id, code: 'FLUIDS', labelEn: 'Fluids', labelAr: 'السوائل', category: 'MECHANICAL', sortOrder: 3 },
          ],
        });
      }
      inspectionServices += 1;
    }

    // Workshop bays.
    for (const b of [
      { code: 'BAY-1', nameEn: 'Bay 1', nameAr: 'الورشة 1' },
      { code: 'BAY-2', nameEn: 'Bay 2', nameAr: 'الورشة 2' },
    ]) {
      await prisma.workshopBay.upsert({
        where: { companyId_code: { companyId: company.id, code: b.code } },
        update: {},
        create: { companyId: company.id, code: b.code, nameEn: b.nameEn, nameAr: b.nameAr, branchId: branch?.id ?? null },
      });
      bays += 1;
    }

    // Bookable resources for the customer booking engine. A workshop bay alone
    // is not bookable: availability is generated from a `BookingResource` and
    // its `WorkingHours`, so a tenant with bays but no resource offers no slot
    // to the mobile app. Two bays, open 08:00–20:00 every day, matching the
    // workshop bays above.
    for (const r of [
      { code: 'RES-BAY-1', nameEn: 'Service Bay 1', nameAr: 'منصة الخدمة ١' },
      { code: 'RES-BAY-2', nameEn: 'Service Bay 2', nameAr: 'منصة الخدمة ٢' },
    ]) {
      const resource = await prisma.bookingResource.upsert({
        where: { companyId_code: { companyId: company.id, code: r.code } },
        update: {},
        create: {
          companyId: company.id,
          branchId: branch?.id ?? null,
          resourceType: 'BAY',
          code: r.code,
          nameEn: r.nameEn,
          nameAr: r.nameAr,
          capacity: 1,
        },
      });
      if ((await prisma.workingHours.count({ where: { resourceId: resource.id } })) === 0) {
        await prisma.workingHours.createMany({
          data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            companyId: company.id,
            branchId: branch?.id ?? null,
            resourceId: resource.id,
            dayOfWeek,
            opensMinute: 8 * 60,
            closesMinute: 20 * 60,
          })),
        });
      }
      bookingResources += 1;
    }

    // Marketplace providers (approved), one per service category, so the
    // customer directory can answer every category filter with real rows. The
    // category keys come from @oryx/shared — the same keys the website chips and
    // the CMS category photography use.
    const providerNames = [
      { key: 'maintenance', nameEn: 'City Auto Care', nameAr: 'رعاية السيارات المدينة' },
      { key: 'vehicle_inspection', nameEn: 'Gulf Inspection Centre', nameAr: 'مركز الخليج للفحص' },
      { key: 'spare_parts', nameEn: 'Al Noor Parts', nameAr: 'النور لقطع الغيار' },
      { key: 'recovery', nameEn: 'Rapid Recovery 24', nameAr: 'الإنقاذ السريع ٢٤' },
      { key: 'car_wash', nameEn: 'Premium Car Wash', nameAr: 'غسيل السيارات المميز' },
    ];
    for (const [index, p] of providerNames.entries()) {
      const provider = await prisma.marketplaceProvider.upsert({
        where: { code: `${company.code}-P${index + 1}` },
        update: { categoryKey: p.key },
        create: {
          code: `${company.code}-P${index + 1}`,
          nameEn: p.nameEn,
          nameAr: p.nameAr,
          categoryKey: p.key,
          providerCompanyId: company.id,
          commissionPercentBp: 1000,
          status: 'APPROVED',
          approvedAt: new Date(),
        },
      });
      if ((await prisma.providerServiceListing.count({ where: { providerId: provider.id } })) === 0) {
        const category = SERVICE_CATEGORIES.find((c) => c.key === p.key)!;
        await prisma.providerServiceListing.create({
          data: {
            providerId: provider.id,
            categoryKey: p.key,
            nameEn: category.nameEn,
            nameAr: category.nameAr,
            priceMinor: 30000,
          },
        });
      }
      // A live promotional offer per provider, so the customer app's offers rail
      // shows real, DB-backed rows. Idempotent by title, and open-ended (no
      // window) so a re-seed does not silently expire it.
      const offerTitle = `Special offer — ${p.nameEn}`;
      if ((await prisma.providerOffer.count({ where: { providerId: provider.id } })) === 0) {
        await prisma.providerOffer.create({
          data: {
            providerId: provider.id,
            titleEn: offerTitle,
            titleAr: `عرض خاص — ${p.nameAr}`,
            description: 'Valid on every service booked through the ORYX app.',
            categoryKey: p.key,
            percentOffBp: 1000 + index * 500,
            isActive: true,
          },
        });
      }
      providers += 1;
    }
  }

  // Link the ORYX-AUTO company administrator to the company's first provider, so
  // the merchant portal (which resolves the provider from the signed-in account's
  // membership) has a working account on a freshly seeded database. Without this
  // link every `/provider/...` route answers 403 for the seeded admins.
  const autoCompanyId = idByCode.get('ORYX-AUTO');
  if (autoCompanyId) {
    const autoAdmin = await prisma.user.findUnique({ where: { email: 'admin@oryx-auto.local' } });
    const firstProvider = await prisma.marketplaceProvider.findFirst({
      where: { providerCompanyId: autoCompanyId },
      orderBy: { code: 'asc' },
    });
    if (autoAdmin && firstProvider) {
      const link = await prisma.providerUser.findFirst({
        where: { providerId: firstProvider.id, userId: autoAdmin.id },
      });
      if (link) {
        await prisma.providerUser.update({ where: { id: link.id }, data: { isActive: true, role: 'OWNER' } });
      } else {
        await prisma.providerUser.create({
          data: { providerId: firstProvider.id, userId: autoAdmin.id, role: 'OWNER', isActive: true },
        });
      }
    }
  }

  console.log(
    `  e03 baseline: ${departments} departments, ${jobTitles} job titles, ${employees} employees, ` +
      `${leaveTypes} leave types, ${shifts} shifts, ${leadSources} lead sources, ${pipelines} pipelines, ` +
      `${inspectionServices} inspection services, ${bays} bays, ${bookingResources} booking resources, ` +
      `${providers} providers`,
  );
}

/**
 * Seed the platform-level Bahrain service-area catalogue.
 *
 * Idempotent by `code` and never overwrites an existing row, so re-running the
 * seed after an administrator has renamed or deactivated an area preserves
 * their change.
 */
async function seedServiceAreas(): Promise<number> {
  let created = 0;
  for (const [index, area] of BAHRAIN_SERVICE_AREAS.entries()) {
    const existing = await prisma.serviceArea.findUnique({ where: { code: area.code } });
    if (existing) continue;
    await prisma.serviceArea.create({
      data: {
        code: area.code,
        nameEn: area.nameEn,
        nameAr: area.nameAr,
        countryCode: DEFAULT_COUNTRY_CODE,
        sortOrder: index,
      },
    });
    created += 1;
  }
  return created;
}

/**
 * Record the launch-market defaults as platform settings.
 *
 * Written explicitly rather than left to the service's fallback so an operator
 * can see and edit them, and so the VAT rate is visibly zero rather than
 * implicitly absent.
 */
async function seedPlatformSettings(): Promise<void> {
  const settings: Array<[string, unknown]> = [
    ['market.country_code', DEFAULT_COUNTRY_CODE],
    ['market.currency', DEFAULT_CURRENCY],
    ['market.timezone', DEFAULT_TIMEZONE],
    ['finance.default_vat_rate_bp', 0],
  ];
  for (const [key, value] of settings) {
    await prisma.platformSetting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  }
}

async function main() {
  assertSeedIsAllowed();
  console.log('ORYX seed — start');
  await seedModules();
  await seedPlans();
  await seedPlatformRoles();
  const superAdmin = await seedUsers();
  const idByCode = await seedCompanies(superAdmin.id);
  await seedSubscriptions(idByCode);
  await seedCompanyAdmins(superAdmin.id, idByCode);
  await seedCms();
  await seedErpBaseline(idByCode, superAdmin.id);
  await seedExecution03Baseline(idByCode, superAdmin.id);
  await seedAuditBaseline(superAdmin.id, idByCode);
  const areas = await seedServiceAreas();
  await seedPlatformSettings();
  console.log(`  e08 baseline: ${areas} new service area(s), platform settings written`);
  console.log('ORYX seed — done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
