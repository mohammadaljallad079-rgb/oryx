/**
 * ORYX permission catalog.
 *
 * A permission is the atomic unit of authorization. It is referenced by code
 * (e.g. `company.branch.create`) and is always evaluated server-side.
 *
 * `scope` describes where the permission may be exercised:
 *  - PLATFORM: only a platform (Super Admin) principal may hold it.
 *  - COMPANY: a company-scoped principal (company admin or delegated staff).
 *  - BRANCH: a branch-scoped principal.
 *
 * `delegable` means a company administrator is permitted to grant this
 * permission to staff inside their own company. Platform permissions are never
 * delegable. `moduleKey` ties the permission to an ERP module so that plan
 * entitlements gate it: an unlicensed module can never be granted or used.
 */

export type PermissionScope = 'PLATFORM' | 'COMPANY' | 'BRANCH';

export interface PermissionDefinition {
  code: string;
  group: string;
  labelEn: string;
  labelAr: string;
  scope: PermissionScope;
  delegable: boolean;
  moduleKey?: string;
  descriptionEn: string;
}

const P = (
  code: string,
  group: string,
  labelEn: string,
  labelAr: string,
  scope: PermissionScope,
  delegable: boolean,
  descriptionEn: string,
  moduleKey?: string,
): PermissionDefinition => ({
  code,
  group,
  labelEn,
  labelAr,
  scope,
  delegable,
  moduleKey,
  descriptionEn,
});

export const PERMISSIONS: PermissionDefinition[] = [
  // ---------------------------------------------------------------- platform
  P('platform.company.create', 'Platform', 'Create company', 'إنشاء شركة', 'PLATFORM', false, 'Provision a new internal or SaaS company.'),
  P('platform.company.read', 'Platform', 'View all companies', 'عرض جميع الشركات', 'PLATFORM', false, 'Read every company across the platform.'),
  P('platform.company.update', 'Platform', 'Update company', 'تعديل الشركة', 'PLATFORM', false, 'Edit company profile and hierarchy.'),
  P('platform.company.suspend', 'Platform', 'Suspend/activate company', 'إيقاف/تنشيط الشركة', 'PLATFORM', false, 'Change company lifecycle status.'),
  P('platform.branch.manage', 'Platform', 'Manage all branches', 'إدارة جميع الفروع', 'PLATFORM', false, 'Create and edit branches for any company.'),
  P('platform.user.read', 'Platform', 'View all users', 'عرض جميع المستخدمين', 'PLATFORM', false, 'Read user accounts across tenants.'),
  P('platform.user.manage', 'Platform', 'Manage platform users', 'إدارة مستخدمي المنصة', 'PLATFORM', false, 'Invite and administer platform-level users.'),
  P('platform.role.manage', 'Platform', 'Manage platform roles', 'إدارة أدوار المنصة', 'PLATFORM', false, 'Create platform-wide roles.'),
  P('platform.module.manage', 'Platform', 'Manage module catalog', 'إدارة كتالوج الوحدات', 'PLATFORM', false, 'Define ERP modules and capabilities.'),
  P('platform.plan.manage', 'Platform', 'Manage subscription plans', 'إدارة خطط الاشتراك', 'PLATFORM', false, 'Create and edit SaaS plans and pricing.'),
  P('platform.subscription.manage', 'Platform', 'Manage subscriptions', 'إدارة الاشتراكات', 'PLATFORM', false, 'Assign, change and cancel company subscriptions.'),
  P('platform.audit.read', 'Platform', 'Read platform audit log', 'قراءة سجل التدقيق', 'PLATFORM', false, 'Read the full audit trail.'),
  P('platform.cms.manage', 'Platform', 'Manage website & app CMS', 'إدارة الموقع والتطبيق', 'PLATFORM', false, 'Manage website and application content.'),
  P('platform.api.manage', 'Platform', 'Manage API & integrations', 'إدارة الواجهات والتكاملات', 'PLATFORM', false, 'Manage versioned APIs, keys and integrations.'),
  P('platform.support.access', 'Platform', 'Support access to a tenant', 'الدخول الدعم لشركة', 'PLATFORM', false, 'Open an explicit, audited, time-bounded support session into a tenant.'),

  // ----------------------------------------------------------------- company
  P('company.read', 'Company', 'View company', 'عرض الشركة', 'COMPANY', true, 'Read own company profile.'),
  P('company.update', 'Company', 'Update company profile', 'تعديل بيانات الشركة', 'COMPANY', true, 'Edit own company profile.'),
  P('company.settings.update', 'Company', 'Update company settings', 'تعديل إعدادات الشركة', 'COMPANY', true, 'Edit company-level configuration.'),
  P('company.branch.read', 'Company', 'View branches', 'عرض الفروع', 'COMPANY', true, 'Read branches of own company.'),
  P('company.branch.create', 'Company', 'Create branch', 'إنشاء فرع', 'COMPANY', true, 'Create a branch within plan limits.'),
  P('company.branch.update', 'Company', 'Update branch', 'تعديل فرع', 'COMPANY', true, 'Edit a branch.'),
  P('company.branch.delete', 'Company', 'Delete branch', 'حذف فرع', 'COMPANY', true, 'Remove a branch.'),
  P('company.user.read', 'Company', 'View users', 'عرض المستخدمين', 'COMPANY', true, 'Read users of own company.'),
  P('company.user.invite', 'Company', 'Invite users', 'دعوة مستخدمين', 'COMPANY', true, 'Invite staff within plan seat limits.'),
  P('company.user.update', 'Company', 'Update users', 'تعديل المستخدمين', 'COMPANY', true, 'Change staff account details and status.'),
  P('company.user.remove', 'Company', 'Remove users', 'إزالة المستخدمين', 'COMPANY', true, 'Revoke staff access.'),
  P('company.role.read', 'Company', 'View roles', 'عرض الأدوار', 'COMPANY', true, 'Read roles defined in own company.'),
  P('company.role.create', 'Company', 'Create role', 'إنشاء دور', 'COMPANY', true, 'Create a company role.'),
  P('company.role.update', 'Company', 'Update role', 'تعديل دور', 'COMPANY', true, 'Change a company role permissions.'),
  P('company.role.delete', 'Company', 'Delete role', 'حذف دور', 'COMPANY', true, 'Remove a company role.'),
  P('company.permission.delegate', 'Company', 'Delegate permissions', 'تفويض الصلاحيات', 'COMPANY', true, 'Grant staff a subset of the delegator\'s own permissions.'),
  P('company.subscription.read', 'Company', 'View subscription', 'عرض الاشتراك', 'COMPANY', true, 'Read own subscription and entitlements.'),
  P('company.subscription.request', 'Company', 'Request plan change', 'طلب تغيير الخطة', 'COMPANY', true, 'Request an upgrade or plan change.'),
  P('company.audit.read', 'Company', 'Read company audit log', 'قراءة سجل الشركة', 'COMPANY', true, 'Read the audit trail of own company.'),

  // ------------------------------------------------------------------ branch
  P('branch.read', 'Branch', 'View branch', 'عرض الفرع', 'BRANCH', true, 'Read own branch profile.'),
  P('branch.user.read', 'Branch', 'View branch users', 'عرض مستخدمي الفرع', 'BRANCH', true, 'Read users assigned to own branch.'),
  P('branch.report.read', 'Branch', 'View branch reports', 'عرض تقارير الفرع', 'BRANCH', true, 'Read reports for own branch.'),

  // ------------------------------------------------------- ERP modules (gated)
  P('erp.dashboard.read', 'ERP', 'View ERP dashboard', 'عرض لوحة المعلومات', 'COMPANY', true, 'Access the ERP dashboard.', 'dashboard'),
  P('erp.company.manage', 'ERP', 'Manage company master data', 'إدارة بيانات الشركة', 'COMPANY', true, 'Manage company records and hierarchy.', 'company_management'),
  P('erp.branch.manage', 'ERP', 'Manage branches', 'إدارة الفروع', 'COMPANY', true, 'Manage branch master data.', 'branch_management'),
  P('erp.accounting.read', 'ERP', 'View accounting', 'عرض المحاسبة', 'COMPANY', true, 'Read accounting records.', 'financial_accounting'),
  P('erp.accounting.write', 'ERP', 'Post accounting entries', 'ترحيل القيود', 'COMPANY', true, 'Create and post journal entries.', 'financial_accounting'),
  P('erp.sales.read', 'ERP', 'View sales & POS', 'عرض المبيعات', 'COMPANY', true, 'Read sales and POS data.', 'sales_pos'),
  P('erp.sales.write', 'ERP', 'Create sales', 'إنشاء مبيعات', 'COMPANY', true, 'Create sales orders and receipts.', 'sales_pos'),
  P('erp.purchasing.read', 'ERP', 'View purchasing', 'عرض المشتريات', 'COMPANY', true, 'Read purchasing data.', 'purchasing_procurement'),
  P('erp.purchasing.write', 'ERP', 'Manage purchasing', 'إدارة المشتريات', 'COMPANY', true, 'Create purchase orders and vendor bills.', 'purchasing_procurement'),
  P('erp.inventory.read', 'ERP', 'View inventory', 'عرض المخزون', 'COMPANY', true, 'Read warehouse and inventory data.', 'warehouses_inventory'),
  P('erp.inventory.write', 'ERP', 'Manage inventory', 'إدارة المخزون', 'COMPANY', true, 'Manage stock movements and transfers.', 'warehouses_inventory'),
  P('erp.hr.read', 'ERP', 'View HR', 'عرض الموارد البشرية', 'COMPANY', true, 'Read employee and HR records.', 'human_resources'),
  P('erp.hr.write', 'ERP', 'Manage HR', 'إدارة الموارد البشرية', 'COMPANY', true, 'Manage employee records.', 'human_resources'),
  P('erp.crm.read', 'ERP', 'View CRM', 'عرض إدارة العملاء', 'COMPANY', true, 'Read customer and lead data.', 'crm'),
  P('erp.crm.write', 'ERP', 'Manage CRM', 'إدارة العملاء', 'COMPANY', true, 'Manage customers and leads.', 'crm'),
  P('erp.operations.read', 'ERP', 'View operations', 'عرض العمليات', 'COMPANY', true, 'Read operations and jobs.', 'operations'),
  P('erp.operations.write', 'ERP', 'Manage operations', 'إدارة العمليات', 'COMPANY', true, 'Manage operations and jobs.', 'operations'),
  P('erp.reports.read', 'ERP', 'View reports & analytics', 'عرض التقارير', 'COMPANY', true, 'Read BI reports and analytics.', 'reports_analytics'),
  P('erp.inspection.read', 'ERP', 'View inspections', 'عرض الفحوصات', 'COMPANY', true, 'Read automotive inspection records.', 'automotive_inspections'),
  P('erp.inspection.write', 'ERP', 'Manage inspections', 'إدارة الفحوصات', 'COMPANY', true, 'Manage inspection bookings and reports.', 'automotive_inspections'),
  P('erp.maintenance.read', 'ERP', 'View maintenance', 'عرض الصيانة', 'COMPANY', true, 'Read maintenance orders.', 'automotive_maintenance'),
  P('erp.maintenance.write', 'ERP', 'Manage maintenance', 'إدارة الصيانة', 'COMPANY', true, 'Manage maintenance orders.', 'automotive_maintenance'),
  P('erp.spare_parts.read', 'ERP', 'View spare parts', 'عرض قطع الغيار', 'COMPANY', true, 'Read spare parts catalog.', 'spare_parts'),
  P('erp.spare_parts.write', 'ERP', 'Manage spare parts', 'إدارة قطع الغيار', 'COMPANY', true, 'Manage spare parts catalog and pricing.', 'spare_parts'),

  // ------------------------------------------------- Execution 02 — Accounting
  P('erp.accounting.coa.manage', 'ERP', 'Manage chart of accounts', 'إدارة دليل الحسابات', 'COMPANY', true, 'Create and edit accounts and the chart of accounts.', 'financial_accounting'),
  P('erp.accounting.fiscal.manage', 'ERP', 'Manage fiscal years & periods', 'إدارة السنوات والفترات', 'COMPANY', true, 'Open, close and lock fiscal years and periods.', 'financial_accounting'),
  P('erp.accounting.journal.post', 'ERP', 'Post journal entries', 'ترحيل القيود اليومية', 'COMPANY', true, 'Create and post balanced double-entry journals.', 'financial_accounting'),
  P('erp.accounting.journal.reverse', 'ERP', 'Reverse journal entries', 'عكس القيود اليومية', 'COMPANY', true, 'Reverse a posted journal entry with a counter-entry.', 'financial_accounting'),
  P('erp.accounting.payment.manage', 'ERP', 'Manage payments & receipts', 'إدارة المدفوعات والمقبوضات', 'COMPANY', true, 'Record payments and receipts against AR/AP.', 'financial_accounting'),
  P('erp.accounting.statement.read', 'ERP', 'View financial statements', 'عرض القوائم المالية', 'COMPANY', true, 'Read the general ledger, trial balance and financial statements.', 'financial_accounting'),

  // ------------------------------------------------------- Execution 02 — Sales
  P('erp.sales.customer.manage', 'ERP', 'Manage customers', 'إدارة العملاء', 'COMPANY', true, 'Create and edit customer master data.', 'sales_pos'),
  P('erp.sales.catalog.manage', 'ERP', 'Manage sales catalog', 'إدارة كتالوج البيع', 'COMPANY', true, 'Manage sellable products and services.', 'sales_pos'),
  P('erp.sales.order.manage', 'ERP', 'Manage quotations & orders', 'إدارة العروض والأوامر', 'COMPANY', true, 'Create quotations and sales orders.', 'sales_pos'),
  P('erp.sales.invoice.manage', 'ERP', 'Manage sales invoices', 'إدارة فواتير البيع', 'COMPANY', true, 'Issue sales invoices and post them to accounting.', 'sales_pos'),
  P('erp.sales.payment.manage', 'ERP', 'Manage customer payments', 'إدارة مدفوعات العملاء', 'COMPANY', true, 'Record customer payments and allocations.', 'sales_pos'),
  P('erp.sales.credit_note.manage', 'ERP', 'Manage credit notes & refunds', 'إدارة إشعارات الدائن', 'COMPANY', true, 'Issue credit notes and process refunds.', 'sales_pos'),
  P('erp.sales.pos.operate', 'ERP', 'Operate POS', 'تشغيل نقاط البيع', 'COMPANY', true, 'Open cashier sessions and record POS sales.', 'sales_pos'),
  P('erp.sales.pos.manage', 'ERP', 'Manage cashier sessions', 'إدارة جلسات الكاشير', 'COMPANY', true, 'Close, reconcile and review cashier sessions.', 'sales_pos'),

  // -------------------------------------------------- Execution 02 — Purchasing
  P('erp.purchasing.supplier.manage', 'ERP', 'Manage suppliers', 'إدارة الموردين', 'COMPANY', true, 'Create and edit supplier master data.', 'purchasing_procurement'),
  P('erp.purchasing.requisition.manage', 'ERP', 'Manage purchase requisitions', 'إدارة طلبات الشراء', 'COMPANY', true, 'Raise and approve purchase requisitions.', 'purchasing_procurement'),
  P('erp.purchasing.order.manage', 'ERP', 'Manage purchase orders', 'إدارة أوامر الشراء', 'COMPANY', true, 'Create and approve purchase orders.', 'purchasing_procurement'),
  P('erp.purchasing.receipt.manage', 'ERP', 'Manage goods receipts', 'إدارة استلام البضائع', 'COMPANY', true, 'Receive goods against a purchase order.', 'purchasing_procurement'),
  P('erp.purchasing.invoice.manage', 'ERP', 'Manage supplier invoices', 'إدارة فواتير الموردين', 'COMPANY', true, 'Record supplier invoices and post them to accounting.', 'purchasing_procurement'),
  P('erp.purchasing.return.manage', 'ERP', 'Manage purchase returns', 'إدارة مرتجعات الشراء', 'COMPANY', true, 'Return goods to a supplier and reverse stock.', 'purchasing_procurement'),
  P('erp.purchasing.payment.manage', 'ERP', 'Manage supplier payments', 'إدارة مدفوعات الموردين', 'COMPANY', true, 'Record payments to suppliers.', 'purchasing_procurement'),

  // --------------------------------------------------- Execution 02 — Inventory
  P('erp.inventory.warehouse.manage', 'ERP', 'Manage warehouses', 'إدارة المستودعات', 'COMPANY', true, 'Create and edit warehouses.', 'warehouses_inventory'),
  P('erp.inventory.item.manage', 'ERP', 'Manage stock items', 'إدارة أصناف المخزون', 'COMPANY', true, 'Manage SKUs, units and reorder levels.', 'warehouses_inventory'),
  P('erp.inventory.movement.manage', 'ERP', 'Record stock movements', 'تسجيل حركات المخزون', 'COMPANY', true, 'Record stock receipts and issues.', 'warehouses_inventory'),
  P('erp.inventory.transfer.manage', 'ERP', 'Manage stock transfers', 'إدارة تحويلات المخزون', 'COMPANY', true, 'Transfer stock between warehouses.', 'warehouses_inventory'),
  P('erp.inventory.adjustment.manage', 'ERP', 'Manage stock adjustments', 'إدارة تسويات المخزون', 'COMPANY', true, 'Adjust stock counts and valuation.', 'warehouses_inventory'),
  P('erp.inventory.valuation.read', 'ERP', 'View inventory valuation', 'عرض تقييم المخزون', 'COMPANY', true, 'Read inventory valuation and stock reports.', 'warehouses_inventory'),

  // ----------------------------------------------------- Execution 02 — Reports
  P('erp.reports.accounting.read', 'ERP', 'View accounting reports', 'عرض التقارير المحاسبية', 'COMPANY', true, 'Read accounting and financial reports.', 'reports_analytics'),
  P('erp.reports.sales.read', 'ERP', 'View sales reports', 'عرض تقارير المبيعات', 'COMPANY', true, 'Read sales and POS reports.', 'reports_analytics'),
  P('erp.reports.purchasing.read', 'ERP', 'View purchasing reports', 'عرض تقارير المشتريات', 'COMPANY', true, 'Read purchasing and supplier reports.', 'reports_analytics'),
  P('erp.reports.inventory.read', 'ERP', 'View inventory reports', 'عرض تقارير المخزون', 'COMPANY', true, 'Read inventory and stock reports.', 'reports_analytics'),
];

export const PERMISSION_BY_CODE: ReadonlyMap<string, PermissionDefinition> = new Map(
  PERMISSIONS.map((p) => [p.code, p]),
);

export const PERMISSION_CODES: readonly string[] = PERMISSIONS.map((p) => p.code);

export const DELEGABLE_PERMISSION_CODES: readonly string[] = PERMISSIONS.filter((p) => p.delegable).map(
  (p) => p.code,
);

export const PLATFORM_PERMISSION_CODES: readonly string[] = PERMISSIONS.filter(
  (p) => p.scope === 'PLATFORM',
).map((p) => p.code);

export const PERMISSION_GROUPS: readonly string[] = Array.from(new Set(PERMISSIONS.map((p) => p.group)));

export function isKnownPermission(code: string): boolean {
  return PERMISSION_BY_CODE.has(code);
}

export function getPermission(code: string): PermissionDefinition | undefined {
  return PERMISSION_BY_CODE.get(code);
}
