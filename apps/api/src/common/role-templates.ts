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
];
