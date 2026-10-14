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
import { MODULES, PERMISSIONS, lineAmountMinor } from '@oryx/shared';

const prisma = new PrismaClient();

const DEMO_MARKER = 'SEED_DEMO_DATA';

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

const CORE_MODULES = [
  'dashboard',
  'company_management',
  'branch_management',
  'users_permissions',
  'subscription_management',
  'settings',
];

const PLANS = [
  {
    code: 'starter',
    nameEn: 'Starter',
    nameAr: 'المبتدئ',
    descriptionEn: 'Core company, branch and user management for small teams.',
    descriptionAr: 'إدارة الشركات والفروع والمستخدمين للفرق الصغيرة.',
    monthlyPrice: '499.00',
    annualPrice: '4990.00',
    trialDays: 14,
    maxCompanies: 1,
    maxBranches: 2,
    maxUsers: 10,
    storageMb: 2048,
    apiRequestsPerMonth: 10000,
    modules: [...CORE_MODULES, 'crm', 'reports_analytics'],
  },
  {
    code: 'professional',
    nameEn: 'Professional',
    nameAr: 'الاحترافي',
    descriptionEn: 'Adds finance, sales, purchasing, inventory and HR.',
    descriptionAr: 'يشمل المالية والمبيعات والمشتريات والمخزون والموارد البشرية.',
    monthlyPrice: '1499.00',
    annualPrice: '14990.00',
    trialDays: 14,
    maxCompanies: 3,
    maxBranches: 10,
    maxUsers: 75,
    storageMb: 20480,
    apiRequestsPerMonth: 100000,
    modules: [
      ...CORE_MODULES,
      'crm',
      'reports_analytics',
      'financial_accounting',
      'sales_pos',
      'purchasing_procurement',
      'warehouses_inventory',
      'human_resources',
      'operations',
    ],
  },
  {
    code: 'enterprise',
    nameEn: 'Enterprise',
    nameAr: 'المؤسسي',
    descriptionEn: 'Full ERP including the automotive ecosystem modules.',
    descriptionAr: 'النظام الكامل بما يشمل وحدات المنظومة اللوجستية للسيارات.',
    monthlyPrice: '3499.00',
    annualPrice: '34990.00',
    trialDays: 30,
    maxCompanies: 25,
    maxBranches: -1,
    maxUsers: -1,
    storageMb: 204800,
    apiRequestsPerMonth: -1,
    modules: MODULES.map((m) => m.key),
  },
];

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

    for (const moduleKey of plan.modules) {
      await prisma.planModule.upsert({
        where: { planId_moduleKey: { planId: record.id, moduleKey } },
        update: {},
        create: { planId: record.id, moduleKey },
      });
    }
    // Remove modules that are no longer part of the plan definition.
    await prisma.planModule.deleteMany({
      where: { planId: record.id, moduleKey: { notIn: plan.modules } },
    });
  }
  console.log(`  plans: ${PLANS.length} upserted`);
}

const PLATFORM_SUPER_ADMIN_PERMISSIONS = PERMISSIONS.filter((p) => p.scope === 'PLATFORM').map(
  (p) => p.code,
);

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
  const role = await prisma.role.upsert({
    where: { companyId_code: { companyId: '', code: 'platform_super_admin' } },
    update: { isPlatform: true, isSystem: true },
    create: {
      code: 'platform_super_admin',
      nameEn: 'Platform Super Admin',
      nameAr: 'مدير المنصة',
      descriptionEn: 'Full platform governance across every company and tenant.',
      isSystem: true,
      isPlatform: true,
    },
  }).catch(async () => {
    // companyId is nullable; Prisma requires a find-first for the null case.
    const existing = await prisma.role.findFirst({
      where: { companyId: null, code: 'platform_super_admin' },
    });
    if (existing) return existing;
    return prisma.role.create({
      data: {
        code: 'platform_super_admin',
        nameEn: 'Platform Super Admin',
        nameAr: 'مدير المنصة',
        descriptionEn: 'Full platform governance across every company and tenant.',
        isSystem: true,
        isPlatform: true,
      },
    });
  });

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
        countryCode: 'SA',
        currency: 'SAR',
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
          countryCode: 'SA',
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
  const assignments: Array<{ companyCode: string; planCode: string; status: 'ACTIVE' | 'TRIAL'; period: 'MONTHLY' | 'ANNUAL' }> = [
    { companyCode: 'ORYX-HOLDING', planCode: 'enterprise', status: 'ACTIVE', period: 'ANNUAL' },
    { companyCode: 'ORYX-AUTO', planCode: 'enterprise', status: 'ACTIVE', period: 'ANNUAL' },
    { companyCode: 'ORYX-REALESTATE', planCode: 'professional', status: 'ACTIVE', period: 'MONTHLY' },
    { companyCode: 'ORYX-LOGISTICS', planCode: 'starter', status: 'ACTIVE', period: 'MONTHLY' },
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
  console.log(`  subscriptions: ${assignments.length} upserted`);
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

  const categories = [
    { key: 'vehicle_inspection', nameEn: 'Vehicle Inspection', nameAr: 'فحص المركبات', domain: 'automotive', sortOrder: 1 },
    { key: 'maintenance', nameEn: 'Maintenance', nameAr: 'الصيانة', domain: 'automotive', sortOrder: 2 },
    { key: 'spare_parts', nameEn: 'Spare Parts', nameAr: 'قطع الغيار', domain: 'marketplace', sortOrder: 3 },
    { key: 'recovery', nameEn: 'Recovery', nameAr: 'الإنقاذ', domain: 'automotive', sortOrder: 4 },
    { key: 'car_wash', nameEn: 'Car Wash', nameAr: 'غسيل السيارات', domain: 'marketplace', sortOrder: 5 },
  ];
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
    const existing = await prisma.account.count({ where: { companyId: company.id } });
    if (existing === 0) {
      await prisma.account.createMany({
        data: STANDARD_CHART.map((a) => ({
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
        })),
      });
      accounts += STANDARD_CHART.length;
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

async function main() {
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
  await seedAuditBaseline(superAdmin.id, idByCode);
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
