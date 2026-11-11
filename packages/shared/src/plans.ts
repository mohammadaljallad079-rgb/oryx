import { MODULES } from './modules';

/**
 * ORYX subscription plan catalogue.
 *
 * Declared once and consumed by both the development seed and the production
 * bootstrap, so a plan cannot differ between a sandbox and a live deployment.
 * Prices are decimal strings in the platform's major unit; the `currency` on the
 * `Plan` row is the market default (`BHD` for Bahrain).
 *
 * `licensedModules` is the snapshot a subscription copies when it is created.
 * Editing a plan here changes what *new* subscriptions license; it never
 * retroactively changes an existing tenant. That rule lives in the entitlement
 * service and is not a property of this file.
 */

export interface PlanDefinition {
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  /** Major units, as a decimal string, e.g. `'499.00'`. */
  monthlyPrice: string;
  annualPrice: string;
  trialDays: number;
  /** -1 means unlimited. */
  maxCompanies: number;
  maxBranches: number;
  maxUsers: number;
  storageMb: number;
  apiRequestsPerMonth: number;
  licensedModules: string[];
}

/** Modules every plan includes: the platform's own administration surface. */
export const CORE_MODULES: readonly string[] = [
  'dashboard',
  'company_management',
  'branch_management',
  'users_permissions',
  'subscription_management',
  'settings',
];

export const PLANS: PlanDefinition[] = [
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
    licensedModules: [...CORE_MODULES, 'crm', 'reports_analytics'],
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
    licensedModules: [
      ...CORE_MODULES,
      'crm',
      'reports_analytics',
      'financial_accounting',
      'sales_pos',
      'purchasing_procurement',
      'warehouses_inventory',
      'human_resources',
      'operations',
      // Execution 04 — the scheduling engine and payment records are useful to
      // any tenant that runs operations, so they are licensed from Professional.
      'booking_engine',
      'payments',
    ],
  },
  {
    code: 'enterprise',
    nameEn: 'Enterprise',
    nameAr: 'المؤسسي',
    descriptionEn: 'Full ERP including the automotive ecosystem modules.',
    descriptionAr: 'النظام الكامل بما يشمل وحدات منظومة السيارات.',
    monthlyPrice: '3499.00',
    annualPrice: '34990.00',
    trialDays: 30,
    maxCompanies: 25,
    maxBranches: -1,
    maxUsers: -1,
    storageMb: 204800,
    apiRequestsPerMonth: -1,
    // Every module in the catalogue. Resolved here from MODULES so a new module
    // is licensed by Enterprise without a second edit.
    licensedModules: MODULES.map((m) => m.key),
  },
];

/** The plan codes, in ascending order of capability. */
export const PLAN_CODES = PLANS.map((p) => p.code);
