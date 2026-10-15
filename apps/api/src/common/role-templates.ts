import { PERMISSIONS } from '@oryx/shared';

/**
 * Default role templates created for every new company.
 *
 * `company_admin` receives every delegable company-scope permission. This is
 * safe because entitlement gating (resolveEffectivePermissions) removes any
 * permission whose ERP module the company's plan does not license, and the
 * delegation validator blocks escalation beyond what the admin effectively
 * holds.
 */
export interface RoleTemplate {
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  permissions: string[];
}

// Every non-platform delegable permission, including BRANCH-scope codes:
// a company administrator must be able to grant the branch-scoped roles it owns.
export const COMPANY_ADMIN_PERMISSION_CODES: string[] = PERMISSIONS.filter(
  (p) => p.scope !== 'PLATFORM' && p.delegable,
).map((p) => p.code);

export const BRANCH_MANAGER_PERMISSION_CODES: string[] = [
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

export const STAFF_VIEWER_PERMISSION_CODES: string[] = [
  'company.read',
  'company.branch.read',
  'branch.read',
  'erp.dashboard.read',
];

/** HR officer: employee records, attendance and leave, but no payroll approval. */
export const HR_OFFICER_PERMISSION_CODES: string[] = [
  'company.read',
  'company.branch.read',
  'branch.read',
  'erp.dashboard.read',
  'erp.hr.read',
  'erp.hr.write',
  'erp.hr.department.manage',
  'erp.hr.employee.manage',
  'erp.hr.document.read',
  'erp.hr.lifecycle.manage',
  'erp.hr.leave.manage',
  'erp.hr.leave.request',
  'erp.hr.leave.approve',
  'erp.hr.attendance.manage',
  'erp.hr.report.read',
];

/** Sales/CRM agent: leads, opportunities and tickets, without conversion rights. */
export const CRM_AGENT_PERMISSION_CODES: string[] = [
  'company.read',
  'company.branch.read',
  'branch.read',
  'erp.dashboard.read',
  'erp.crm.read',
  'erp.crm.write',
  'erp.crm.lead.manage',
  'erp.crm.opportunity.manage',
  'erp.crm.contact.manage',
  'erp.crm.activity.manage',
  'erp.crm.ticket.manage',
  'erp.sales.read',
];

/** Workshop technician: job cards, parts and inspections. */
export const WORKSHOP_TECHNICIAN_PERMISSION_CODES: string[] = [
  'company.read',
  'company.branch.read',
  'branch.read',
  'erp.dashboard.read',
  'erp.vehicle.read',
  'erp.vehicle.manage',
  'erp.inspection.read',
  'erp.inspection.booking.manage',
  'erp.maintenance.read',
  'erp.maintenance.booking.manage',
  'erp.maintenance.jobcard.manage',
  'erp.maintenance.estimate.manage',
  'erp.spare_parts.read',
  'erp.parts.reserve',
  'erp.parts.issue',
  'erp.inventory.read',
];

/** Booking coordinator: the shared calendar, resources and customer intake. */
export const BOOKING_COORDINATOR_PERMISSION_CODES: string[] = [
  'company.read',
  'company.branch.read',
  'branch.read',
  'erp.dashboard.read',
  'erp.booking.read',
  'erp.booking.manage',
  'erp.booking.resource.manage',
  'erp.customer_portal.read',
  'erp.vehicle.read',
  'erp.inspection.read',
  'erp.maintenance.read',
  'erp.crm.read',
];

/**
 * Provider manager: the marketplace side of the house. Deliberately excludes
 * `erp.payments.manage`, so a provider-facing operator cannot move money.
 */
export const PROVIDER_MANAGER_PERMISSION_CODES: string[] = [
  'company.read',
  'company.branch.read',
  'branch.read',
  'erp.dashboard.read',
  'erp.provider_portal.read',
  'erp.provider_portal.manage',
  'erp.marketplace.provider.manage',
  'erp.marketplace.listing.manage',
  'erp.marketplace.request.manage',
  'erp.marketplace.commission.manage',
  'erp.booking.read',
  'erp.booking.manage',
  'erp.crm.read',
  'erp.crm.ticket.manage',
];

/** Finance officer: payment records, refunds and reconciliation. */
export const FINANCE_OFFICER_PERMISSION_CODES: string[] = [
  'company.read',
  'company.branch.read',
  'branch.read',
  'erp.dashboard.read',
  'erp.accounting.read',
  'erp.accounting.payment.manage',
  'erp.accounting.statement.read',
  'erp.sales.read',
  'erp.sales.payment.manage',
  'erp.payments.read',
  'erp.payments.manage',
  'erp.payments.reconcile',
  'erp.reports.read',
  'erp.reports.accounting.read',
];

export const DEFAULT_COMPANY_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    code: 'company_admin',
    nameEn: 'Company Administrator',
    nameAr: 'مدير الشركة',
    descriptionEn: 'Full administration of the company within plan entitlements.',
    permissions: COMPANY_ADMIN_PERMISSION_CODES,
  },
  {
    code: 'branch_manager',
    nameEn: 'Branch Manager',
    nameAr: 'مدير الفرع',
    descriptionEn: 'Manages a single branch and its staff.',
    permissions: BRANCH_MANAGER_PERMISSION_CODES,
  },
  {
    code: 'staff_viewer',
    nameEn: 'Staff (read-only)',
    nameAr: 'موظف (قراءة فقط)',
    descriptionEn: 'Read-only access to company and branch information.',
    permissions: STAFF_VIEWER_PERMISSION_CODES,
  },
  {
    code: 'hr_officer',
    nameEn: 'HR Officer',
    nameAr: 'مسؤول الموارد البشرية',
    descriptionEn: 'Employee records, attendance and leave, without payroll approval.',
    permissions: HR_OFFICER_PERMISSION_CODES,
  },
  {
    code: 'crm_agent',
    nameEn: 'CRM Agent',
    nameAr: 'مسؤول العملاء',
    descriptionEn: 'Leads, opportunities, activities and support tickets.',
    permissions: CRM_AGENT_PERMISSION_CODES,
  },
  {
    code: 'workshop_technician',
    nameEn: 'Workshop Technician',
    nameAr: 'فني الورشة',
    descriptionEn: 'Job cards, inspections, parts reservation and issue.',
    permissions: WORKSHOP_TECHNICIAN_PERMISSION_CODES,
  },
  {
    code: 'booking_coordinator',
    nameEn: 'Booking Coordinator',
    nameAr: 'منسق الحجوزات',
    descriptionEn: 'Manages the shared booking calendar, resources and customer intake.',
    permissions: BOOKING_COORDINATOR_PERMISSION_CODES,
  },
  {
    code: 'provider_manager',
    nameEn: 'Provider Manager',
    nameAr: 'مسؤول مزودي الخدمة',
    descriptionEn: 'Provider onboarding, listings, marketplace requests and reviews.',
    permissions: PROVIDER_MANAGER_PERMISSION_CODES,
  },
  {
    code: 'finance_officer',
    nameEn: 'Finance Officer',
    nameAr: 'مسؤول المالية',
    descriptionEn: 'Payment records, refunds, reconciliation and financial reporting.',
    permissions: FINANCE_OFFICER_PERMISSION_CODES,
  },
];
