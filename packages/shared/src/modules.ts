/**
 * ORYX ERP module catalog.
 *
 * Modules are the sellable/licensable units of the ERP. A plan grants a set of
 * modules; a company can only use what its active subscription licenses.
 * The same catalog drives backend authorization and frontend navigation so the
 * two can never disagree.
 */

export type ModuleStatus = 'AVAILABLE' | 'PLANNED';

export interface ModuleDefinition {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  /** Navigation group used by the admin shell. */
  group: string;
  icon: string;
  /**
   * Base name of the tile image. Resolves to an approved photographic asset at
   * `/tiles/<tileImage>.jpg`, cropped from the owner-approved dashboard
   * reference (see scripts/extract-approved-assets.py).
   */
  tileImage: string;
  /** Route inside the admin app. */
  route: string;
  /** AVAILABLE = real DB-backed workflow shipped. PLANNED = routed placeholder. */
  status: ModuleStatus;
  /** Permission required to open the module. */
  readPermission: string;
  writePermission?: string;
  /** Execution phase that owns delivery of this module. */
  deliveryPhase: string;
}

export const MODULE_GROUPS = [
  'core',
  'finance',
  'commerce',
  'operations',
  'automotive',
  'customer',
  'analytics',
  'administration',
] as const;

export type ModuleGroup = (typeof MODULE_GROUPS)[number];

const M = (
  key: string,
  nameEn: string,
  nameAr: string,
  descriptionEn: string,
  descriptionAr: string,
  group: string,
  icon: string,
  tileImage: string,
  route: string,
  status: ModuleStatus,
  readPermission: string,
  deliveryPhase: string,
  writePermission?: string,
): ModuleDefinition => ({
  key,
  nameEn,
  nameAr,
  descriptionEn,
  descriptionAr,
  group,
  icon,
  tileImage,
  route,
  status,
  readPermission,
  writePermission,
  deliveryPhase,
});

export const MODULES: ModuleDefinition[] = [
  M('dashboard', 'Dashboard', 'لوحة المعلومات', 'Operational overview for the selected company and branch.', 'نظرة تشغيلية للشركة والفرع المحدد.', 'core', 'gauge', 'tile-dashboard', '/dashboard/overview', 'AVAILABLE', 'erp.dashboard.read', 'execution-01'),
  M('company_management', 'Company Management', 'إدارة الشركات', 'Companies, subsidiaries, hierarchy and lifecycle.', 'الشركات والشركات التابعة والهيكل ودورة الحياة.', 'core', 'building', 'tile-company', '/companies', 'AVAILABLE', 'erp.company.manage', 'execution-01'),
  M('branch_management', 'Branch Management', 'إدارة الفروع', 'Branches, locations and branch-level scoping.', 'الفروع والمواقع ونطاق الفرع.', 'core', 'map-pin', 'tile-branch', '/branches', 'AVAILABLE', 'erp.branch.manage', 'execution-01'),
  M('financial_accounting', 'Financial Accounting', 'المحاسبة المالية', 'Chart of accounts, journals, AR/AP and VAT.', 'دليل الحسابات والقيود والمدينون والدائنون والضريبة.', 'finance', 'calculator', 'tile-accounting', '/accounting', 'AVAILABLE', 'erp.accounting.read', 'execution-02', 'erp.accounting.write'),
  M('sales_pos', 'Sales & POS', 'المبيعات ونقاط البيع', 'Sales orders, receipts and point-of-sale integration.', 'أوامر البيع والإيصالات ونقاط البيع.', 'commerce', 'shopping-cart', 'tile-sales', '/sales', 'AVAILABLE', 'erp.sales.read', 'execution-02', 'erp.sales.write'),
  M('purchasing_procurement', 'Purchasing & Procurement', 'المشتريات والتوريد', 'Purchase orders, vendors and procurement workflow.', 'أوامر الشراء والموردون.', 'commerce', 'truck', 'tile-purchasing', '/purchasing', 'AVAILABLE', 'erp.purchasing.read', 'execution-02', 'erp.purchasing.write'),
  M('warehouses_inventory', 'Warehouses & Inventory', 'المستودعات والمخزون', 'Warehouses, stock movements and transfers.', 'المستودعات وحركات المخزون والتحويلات.', 'operations', 'warehouse', 'tile-warehouse', '/inventory', 'AVAILABLE', 'erp.inventory.read', 'execution-02', 'erp.inventory.write'),
  M('human_resources', 'Human Resources', 'الموارد البشرية', 'Employees, attendance and payroll-ready entities.', 'الموظفون والحضور وكيانات الرواتب.', 'operations', 'users', 'tile-hr', '/hr', 'AVAILABLE', 'erp.hr.read', 'execution-03', 'erp.hr.write'),
  M('crm', 'CRM', 'إدارة علاقات العملاء', 'Customers, leads and relationship pipeline.', 'العملاء والعملاء المحتملون.', 'commerce', 'heart-handshake', 'tile-crm', '/crm', 'AVAILABLE', 'erp.crm.read', 'execution-03', 'erp.crm.write'),
  M('operations', 'Operations', 'العمليات', 'Jobs, work orders and service operations.', 'الأعمال وأوامر العمل.', 'operations', 'settings', 'tile-operations', '/operations', 'AVAILABLE', 'erp.operations.read', 'execution-03', 'erp.operations.write'),
  M('automotive_inspections', 'Automotive Inspections', 'الفحوصات الفنية', 'Inspection templates, bookings and reports.', 'قوالب الفحص والحجوزات والتقارير.', 'automotive', 'clipboard-check', 'tile-inspection', '/automotive/inspections', 'AVAILABLE', 'erp.inspection.read', 'execution-03', 'erp.inspection.write'),
  M('automotive_maintenance', 'Automotive Maintenance', 'صيانة المركبات', 'Maintenance orders and service history.', 'أوامر الصيانة وسجل الخدمة.', 'automotive', 'wrench', 'tile-maintenance', '/automotive/maintenance', 'AVAILABLE', 'erp.maintenance.read', 'execution-03', 'erp.maintenance.write'),
  M('spare_parts', 'Spare Parts', 'قطع الغيار', 'Spare parts catalog, fitment and marketplace.', 'كتالوج قطع الغيار والتوافق والسوق.', 'automotive', 'package', 'tile-parts', '/automotive/spare-parts', 'AVAILABLE', 'erp.spare_parts.read', 'execution-03', 'erp.spare_parts.write'),
  M('reports_analytics', 'Reports & Analytics', 'التقارير والتحليلات', 'Business intelligence and cross-module reporting.', 'ذكاء الأعمال والتقارير.', 'analytics', 'bar-chart', 'tile-reports', '/reports', 'AVAILABLE', 'erp.reports.read', 'execution-02'),
  M('users_permissions', 'Users & Permissions', 'المستخدمون والصلاحيات', 'Company users, roles and delegated permissions.', 'مستخدمو الشركة والأدوار والصلاحيات المفوضة.', 'administration', 'shield', 'tile-users', '/users', 'AVAILABLE', 'company.user.read', 'execution-01'),
  M('subscription_management', 'Subscription Management', 'إدارة الاشتراك', 'Plan, entitlements, limits and billing history.', 'الخطة والاستحقاقات والحدود وسجل الفواتير.', 'administration', 'credit-card', 'tile-subscription', '/subscriptions', 'AVAILABLE', 'company.subscription.read', 'execution-01'),
  M('settings', 'Settings', 'الإعدادات', 'Company settings, localization and preferences.', 'إعدادات الشركة واللغة والتفضيلات.', 'administration', 'sliders', 'tile-settings', '/settings', 'AVAILABLE', 'company.settings.update', 'execution-01'),

  // ---------------------------------------------- Execution 04 — customer platform
  M('customer_portal', 'Customer Platform', 'منصة العملاء', 'Consumer website and mobile application: garage, bookings, invoices and support.', 'موقع وتطبيق العملاء: المركبات والحجوزات والفواتير والدعم.', 'customer', 'car', 'tile-app', '/customer', 'AVAILABLE', 'erp.customer_portal.read', 'execution-04', 'erp.customer_portal.manage'),
  M('booking_engine', 'Booking & Scheduling', 'الحجوزات والجدولة', 'Shared scheduling engine for inspections, workshops and providers.', 'محرك جدولة موحّد للفحوصات والورش ومزودي الخدمة.', 'customer', 'calendar', 'tile-inspection', '/bookings', 'AVAILABLE', 'erp.booking.read', 'execution-04', 'erp.booking.manage'),
  M('provider_portal', 'Provider Portal', 'بوابة مزودي الخدمة', 'Provider onboarding, listings, bookings, reviews and settlements.', 'تسجيل المزودين والقوائم والحجوزات والتقييمات والتسويات.', 'customer', 'store', 'tile-parts', '/providers', 'AVAILABLE', 'erp.provider_portal.read', 'execution-04', 'erp.provider_portal.manage'),
  M('payments', 'Payments & Settlements', 'المدفوعات والتسويات', 'Payment records, intents, refunds, webhooks and reconciliation.', 'سجلات الدفع والنوايا والاسترداد والويب هوك والمطابقة.', 'finance', 'credit-card', 'tile-accounting', '/payments', 'AVAILABLE', 'erp.payments.read', 'execution-04', 'erp.payments.manage'),
];

export const MODULE_BY_KEY: ReadonlyMap<string, ModuleDefinition> = new Map(MODULES.map((m) => [m.key, m]));

export const MODULE_KEYS: readonly string[] = MODULES.map((m) => m.key);

/** Modules whose workflow is genuinely implemented and DB-backed. */
export const AVAILABLE_MODULE_KEYS: readonly string[] = MODULES.filter((m) => m.status === 'AVAILABLE').map(
  (m) => m.key,
);

/** Routed but deliberately not implemented in Execution 01. */
export const PLANNED_MODULE_KEYS: readonly string[] = MODULES.filter((m) => m.status === 'PLANNED').map(
  (m) => m.key,
);

export function isKnownModule(key: string): boolean {
  return MODULE_BY_KEY.has(key);
}

export function getModule(key: string): ModuleDefinition | undefined {
  return MODULE_BY_KEY.get(key);
}

/**
 * Resolve a module's tile image to a servable URL.
 *
 * Assets are JPEG photographs extracted from the owner-approved reference, not
 * generated artwork. See `scripts/extract-approved-assets.py`.
 */
export function tileImageUrl(tileImage: string): string {
  return `/tiles/${tileImage}.jpg`;
}

export function modulesForPermission(permissionCodes: readonly string[]): ModuleDefinition[] {
  const set = new Set(permissionCodes);
  return MODULES.filter((m) => set.has(m.readPermission));
}
