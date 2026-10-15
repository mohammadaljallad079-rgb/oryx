import type {
  IntegrationCategory,
  IntegrationImplementation,
  IntegrationProviderState,
} from './integrations';

/** Shared API contracts between the ORYX API and the admin app. */

export type CompanyType = 'INTERNAL' | 'SAAS_TENANT';
export type CompanyStatus = 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING' | 'ARCHIVED';
export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'CANCELLED';
export type BillingPeriod = 'MONTHLY' | 'ANNUAL';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Machine-readable code for i18n on the client. */
  code?: string;
  correlationId?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionUser {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string;
  status: UserStatus;
  kind: 'PLATFORM' | 'COMPANY';
  preferredLocale: 'ar' | 'en';
  preferredTheme: 'dark' | 'light';
  isSuperAdmin: boolean;
}

export interface MembershipSummary {
  companyId: string;
  companyNameEn: string;
  companyNameAr: string;
  companyType: CompanyType;
  companyStatus: CompanyStatus;
  roleId: string;
  roleNameEn: string;
  roleNameAr: string;
  branchIds: string[];
}

export interface LoginResponse {
  accessToken: string;
  /**
   * Only present in development when COOKIE_AUTH is disabled. With cookie
   * transport enabled the refresh token is set as an HttpOnly cookie and this
   * field is omitted, so it is never exposed to JavaScript.
   */
  refreshToken?: string;
  /** CSRF token the client must echo in the `x-oryx-csrf` header. */
  csrfToken?: string;
  expiresIn: number;
  user: SessionUser;
  memberships: MembershipSummary[];
  permissions: string[];
}

/** Returned when a password is correct but MFA must be completed first. */
export interface MfaChallengeResponse {
  mfaRequired: true;
  /** Short-lived token that authorises only the MFA verification step. */
  challengeToken: string;
  expiresIn: number;
}

export type LoginResult = LoginResponse | MfaChallengeResponse;

export function isMfaChallenge(result: LoginResult): result is MfaChallengeResponse {
  return (result as MfaChallengeResponse).mfaRequired === true;
}

export interface CompanyContextOption {
  id: string;
  nameEn: string;
  nameAr: string;
  type: CompanyType;
  status: CompanyStatus;
}

export interface BranchContextOption {
  id: string;
  companyId: string;
  nameEn: string;
  nameAr: string;
  code: string;
}

export interface ContextResponse {
  companies: CompanyContextOption[];
  branches: BranchContextOption[];
  /** Licensed module keys for the currently selected company (platform = all). */
  licensedModules: string[];
  /** Effective permission codes for the current selection. */
  permissions: string[];
}

export interface DashboardKpis {
  companies: number;
  activeCompanies: number;
  branches: number;
  users: number;
  activeSubscriptions: number;
  monthlyRecurringRevenue: number;
  currency: string;
  openSupportSessions: number;
  modulesLicensed: number;
  planUtilisationPct: number;
}

export interface DashboardSeriesPoint {
  label: string;
  value: number;
  secondary?: number;
}

export interface DashboardTile {
  moduleKey: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  route: string;
  tileImage: string;
  status: string;
  available: boolean;
}

export interface DashboardResponse {
  scope: {
    companyId: string | null;
    companyNameEn: string;
    companyNameAr: string;
    branchId: string | null;
    isPlatformScope: boolean;
  };
  kpis: DashboardKpis;
  /** True when the numbers are synthetic seed data, false when real records exist. */
  isDemoData: boolean;
  branchPerformance: DashboardSeriesPoint[];
  moduleAdoption: DashboardSeriesPoint[];
  recentActivity: Array<{
    id: string;
    action: string;
    actorEmail: string | null;
    targetType: string;
    targetId: string | null;
    createdAt: string;
  }>;
  tiles: DashboardTile[];
}

export interface ModuleDto {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  group: string;
  icon: string;
  route: string;
  status: string;
  deliveryPhase: string;
  readPermission: string;
  writePermission: string | null;
}

export interface PlanModuleDto {
  moduleKey: string;
  nameEn: string;
  nameAr: string;
  group: string;
}

export interface PlanDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  isPublic: boolean;
  isActive: boolean;
  trialDays: number;
  maxCompanies: number;
  maxBranches: number;
  maxUsers: number;
  storageMb: number;
  apiRequestsPerMonth: number;
  modules: PlanModuleDto[];
  subscriberCount?: number;
}

export interface SubscriptionDto {
  id: string;
  companyId: string;
  companyNameEn: string;
  companyNameAr: string;
  planId: string;
  planNameEn: string;
  planNameAr: string;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  price: number;
  currency: string;
  startedAt: string;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  licensedModules: string[];
}

export interface CompanyDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  legalNameEn: string | null;
  type: CompanyType;
  status: CompanyStatus;
  industry: string | null;
  countryCode: string | null;
  currency: string;
  parentCompanyId: string | null;
  parentCompanyNameEn: string | null;
  createdAt: string;
  branchCount?: number;
  userCount?: number;
  subscription?: SubscriptionDto | null;
}

export interface BranchDto {
  id: string;
  companyId: string;
  companyNameEn: string;
  code: string;
  nameEn: string;
  nameAr: string;
  city: string | null;
  countryCode: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  userCount?: number;
}

export interface RoleDto {
  id: string;
  companyId: string | null;
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount?: number;
}

export interface UserDto {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string;
  status: UserStatus;
  isSuperAdmin: boolean;
  preferredLocale: 'ar' | 'en';
  preferredTheme: 'dark' | 'light';
  lastLoginAt: string | null;
  createdAt: string;
  memberships: MembershipSummary[];
}

export interface InvitationDto {
  id: string;
  email: string;
  companyId: string;
  companyNameEn: string;
  roleId: string;
  roleNameEn: string;
  branchIds: string[];
  status: string;
  expiresAt: string;
  invitedByEmail: string | null;
  createdAt: string;
  /** Present only on creation, never persisted in plaintext. */
  inviteToken?: string;
}

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  companyId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  ipAddress: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface CmsPageDto {
  id: string;
  slug: string;
  locale: 'ar' | 'en';
  title: string;
  excerpt: string | null;
  body: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  updatedAt: string;
}

export interface CmsBannerDto {
  id: string;
  placement: string;
  locale: 'ar' | 'en';
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  actionUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface FeatureFlagDto {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  enabled: boolean;
  audience: string;
  rolloutPercentage: number;
}

export interface AppVersionDto {
  id: string;
  platform: 'IOS' | 'ANDROID';
  version: string;
  buildNumber: string;
  releaseNotes: string | null;
  minSupportedVersion: string;
  isActive: boolean;
  releasedAt: string | null;
}

export interface ApiClientDto {
  id: string;
  name: string;
  clientId: string;
  scopes: string[];
  isActive: boolean;
  rateLimitPerMinute: number;
  lastUsedAt: string | null;
  /** Only returned once at creation. */
  secret?: string;
}

// ============================================================================
// Execution 02 — ERP core contracts
//
// Money is integer minor units (halalas) throughout; quantities are scaled by
// 10^4 and percentages are basis points (1500 = 15.00%). The admin app formats
// these with the helpers in `money.ts` so the UI shows exactly what the API
// posted.
// ============================================================================

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type AccountNormalBalance = 'DEBIT' | 'CREDIT';
export type FiscalPeriodStatus = 'OPEN' | 'CLOSED' | 'LOCKED';
export type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export interface ErpAccountDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  type: AccountType;
  normalBalance: AccountNormalBalance;
  parentId: string | null;
  level: number;
  isPostable: boolean;
  isSystem: boolean;
  systemRole: string | null;
  currency: string;
  isActive: boolean;
}

export interface FiscalPeriodDto {
  id: string;
  periodNumber: number;
  nameEn: string;
  nameAr: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
}

export interface FiscalYearDto {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  periods: FiscalPeriodDto[];
}

export interface JournalLineDto {
  id: string;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  accountNameEn: string;
  accountNameAr: string;
  description: string | null;
  debitMinor: number;
  creditMinor: number;
}

export interface JournalEntryDto {
  id: string;
  entryNumber: string;
  entryDate: string;
  status: JournalStatus;
  sourceType: string;
  sourceId: string | null;
  memo: string | null;
  currency: string;
  totalDebitMinor: number;
  totalCreditMinor: number;
  reversalOfId: string | null;
  lines: JournalLineDto[];
}

export interface LedgerLineDto {
  entryId: string;
  entryNumber: string;
  entryDate: string;
  description: string | null;
  debitMinor: number;
  creditMinor: number;
  runningBalanceMinor: number;
}

export interface LedgerAccountDto {
  accountId: string;
  code: string;
  nameEn: string;
  nameAr: string;
  type: AccountType;
  normalBalance: AccountNormalBalance;
  totalDebitMinor: number;
  totalCreditMinor: number;
  closingBalanceMinor: number;
  lines: LedgerLineDto[];
}

export interface TrialBalanceRowDto {
  accountId: string;
  code: string;
  nameEn: string;
  nameAr: string;
  type: AccountType;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
}

export interface TrialBalanceDto {
  from: string | null;
  to: string | null;
  rows: TrialBalanceRowDto[];
  totalDebitMinor: number;
  totalCreditMinor: number;
  balanced: boolean;
}

export interface StatementLineDto {
  accountId: string;
  code: string;
  nameEn: string;
  nameAr: string;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
}

export interface IncomeStatementDto {
  from: string | null;
  to: string | null;
  revenue: StatementLineDto[];
  expense: StatementLineDto[];
  totalRevenueMinor: number;
  totalExpenseMinor: number;
  netIncomeMinor: number;
}

export interface BalanceSheetDto {
  asOf: string | null;
  assets: StatementLineDto[];
  liabilities: StatementLineDto[];
  equity: StatementLineDto[];
  totalAssetsMinor: number;
  totalLiabilitiesMinor: number;
  totalEquityMinor: number;
  netIncomeMinor: number;
  totalLiabilitiesAndEquityMinor: number;
  balanced: boolean;
}

export interface AgingRowDto {
  id: string;
  invoiceNumber: string;
  customerId?: string;
  customerNameEn?: string;
  customerNameAr?: string;
  supplierId?: string;
  supplierNameEn?: string;
  supplierNameAr?: string;
  supplierInvoiceNumber?: string;
  invoiceDate: string;
  dueDate: string | null;
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  daysOverdue: number;
  bucket: string;
}

export interface PaymentAllocationDto {
  id: string;
  target: 'SALES_INVOICE' | 'SUPPLIER_INVOICE' | 'CREDIT_NOTE';
  salesInvoiceId: string | null;
  supplierInvoiceId: string | null;
  creditNoteId: string | null;
  amountMinor: number;
}

export interface PaymentDto {
  id: string;
  paymentNumber: string;
  direction: 'RECEIPT' | 'PAYMENT';
  partyType: 'CUSTOMER' | 'SUPPLIER';
  customerId: string | null;
  supplierId: string | null;
  partyNameEn: string | null;
  partyNameAr: string | null;
  method: string;
  amountMinor: number;
  currency: string;
  reference: string | null;
  notes: string | null;
  paidAt: string;
  journalEntryId: string | null;
  allocations: PaymentAllocationDto[];
}

export interface WarehouseDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  branchId: string | null;
  branchNameEn: string | null;
  branchNameAr: string | null;
  addressLine: string | null;
  inventoryAccountId: string | null;
  isActive: boolean;
}

export interface ProductDto {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  type: 'PRODUCT' | 'SERVICE';
  unit: string;
  barcode: string | null;
  salesPriceMinor: number;
  costPriceMinor: number;
  taxRateBp: number;
  reorderLevel: number;
  reorderQuantity: number;
  trackStock: boolean;
  salesAccountId: string | null;
  inventoryAccountId: string | null;
  cogsAccountId: string | null;
  isActive: boolean;
}

export interface StockMovementDto {
  id: string;
  movementType: string;
  quantity: number;
  quantityText: string;
  unitCostMinor: number;
  totalCostMinor: number;
  balanceAfter: number;
  source: string;
  sourceId: string | null;
  memo: string | null;
  occurredAt: string;
  sku: string;
  productNameEn: string;
  productNameAr: string;
  warehouseCode: string;
  warehouseNameEn: string;
  warehouseNameAr: string;
}

export interface StockTransferDto {
  id: string;
  transferNumber: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  notes: string | null;
  postedAt: string | null;
  createdAt: string;
  lines: Array<{ id: string; productId: string; quantity: number; quantityText: string }>;
}

export interface StockAdjustmentDto {
  id: string;
  adjustmentNumber: string;
  warehouseId: string;
  reason: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  postedAt: string | null;
  createdAt: string;
  lines: Array<{
    id: string;
    productId: string;
    quantityDelta: number;
    quantityDeltaText: string;
    unitCostMinor: number;
  }>;
}

export interface ValuationRowDto {
  warehouseId: string;
  warehouseCode: string;
  productId: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  quantity: number;
  averageCostMinor: number;
  valueMinor: number;
  reorderLevel?: number;
}

export interface ReorderAlertDto {
  productId: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  onHand: number;
  reorderLevel: number;
  reorderQuantity: number;
  belowReorderLevel: boolean;
}

export interface CustomerDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  addressLine: string | null;
  city: string | null;
  countryCode: string | null;
  creditLimitMinor: number;
  paymentTermsDays: number;
  currency: string;
  isActive: boolean;
  notes: string | null;
}

export interface SupplierDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  addressLine: string | null;
  city: string | null;
  countryCode: string | null;
  paymentTermsDays: number;
  currency: string;
  isActive: boolean;
  notes: string | null;
}

/** Shared shape for quotations, orders, invoices and credit notes. */
export interface SalesDocumentDto {
  id: string;
  quoteNumber?: string;
  orderNumber?: string;
  invoiceNumber?: string;
  creditNoteNumber?: string;
  customerId: string;
  customerNameEn: string;
  customerNameAr: string;
  status: string;
  issueDate?: string;
  orderDate?: string;
  invoiceDate?: string;
  dueDate?: string | null;
  validUntil?: string | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor?: number;
  outstandingMinor?: number;
  currency: string;
  notes: string | null;
  journalEntryId?: string | null;
  convertedOrderId?: string | null;
  orderId?: string | null;
  lines: Array<Record<string, unknown>>;
}

export interface CashierSessionDto {
  id: string;
  sessionNumber: string;
  branchId: string;
  branchNameEn: string;
  branchNameAr: string;
  warehouseId: string | null;
  status: 'OPEN' | 'CLOSED';
  openingFloatMinor: number;
  expectedCashMinor: number;
  countedCashMinor: number | null;
  varianceMinor: number | null;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  saleCount?: number;
}

export interface PosSaleDto {
  id: string;
  receiptNumber: string;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  changeMinor: number;
  paymentMethod: string;
  currency: string;
  createdAt: string;
  lines: Array<Record<string, unknown>>;
}

export interface RequisitionDto {
  id: string;
  requisitionNumber: string;
  status: string;
  requestedById: string;
  neededBy: string | null;
  supplierId: string | null;
  supplierNameEn: string | null;
  supplierNameAr: string | null;
  notes: string | null;
  convertedOrderId: string | null;
  createdAt: string;
  lines: Array<Record<string, unknown>>;
}

/** Shared shape for purchase orders, receipts, invoices and returns. */
export interface PurchaseDocumentDto {
  id: string;
  orderNumber?: string;
  receiptNumber?: string;
  invoiceNumber?: string;
  returnNumber?: string;
  supplierInvoiceNumber?: string;
  supplierId: string;
  supplierNameEn?: string;
  supplierNameAr?: string;
  purchaseOrderId?: string | null;
  warehouseId?: string;
  status: string;
  orderDate?: string;
  expectedDate?: string | null;
  receivedAt?: string;
  invoiceDate?: string;
  returnDate?: string;
  dueDate?: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor?: number;
  outstandingMinor?: number;
  currency: string;
  notes?: string | null;
  reason?: string | null;
  journalEntryId?: string | null;
  lines: Array<Record<string, unknown>>;
}

export interface AccountingReportDto {
  from: string | null;
  to: string | null;
  journalCount: number;
  totalDebitMinor: number;
  totalCreditMinor: number;
  balanced: boolean;
  bySourceType: Array<{ sourceType: string; count: number; debitMinor: number; creditMinor: number }>;
}

export interface SalesReportDto {
  from: string | null;
  to: string | null;
  invoiceCount: number;
  totalSalesMinor: number;
  totalTaxMinor: number;
  totalPaidMinor: number;
  totalOutstandingMinor: number;
  posSaleCount: number;
  posTotalMinor: number;
  byCustomer: Array<{
    customerId: string;
    nameEn: string;
    nameAr: string;
    invoiceCount: number;
    totalMinor: number;
    paidMinor: number;
    outstandingMinor: number;
  }>;
  byBranch: Array<{
    branchId: string | null;
    nameEn: string;
    nameAr: string;
    invoiceCount: number;
    totalMinor: number;
    taxMinor: number;
  }>;
}

export interface PurchasingReportDto {
  from: string | null;
  to: string | null;
  orderCount: number;
  totalOrderedMinor: number;
  invoiceCount: number;
  totalInvoicedMinor: number;
  totalPaidMinor: number;
  totalOutstandingMinor: number;
  bySupplier: Array<{
    supplierId: string;
    nameEn: string;
    nameAr: string;
    orderedMinor: number;
    invoicedMinor: number;
    paidMinor: number;
    outstandingMinor: number;
  }>;
}

export interface InventoryReportDto {
  from: string | null;
  to: string | null;
  totalValueMinor: number;
  totalQuantity: number;
  valuation: ValuationRowDto[];
  movementTotals: Array<{
    productId: string;
    sku: string;
    nameEn: string;
    nameAr: string;
    quantityIn: number;
    quantityOut: number;
    netQuantity: number;
  }>;
  reorderAlerts: Array<{ sku: string; nameEn: string; nameAr: string; onHand: number; reorderLevel: number }>;
}

// ============================================================================
// Execution 03 — HR, CRM, operations and automotive contracts
//
// Money is integer minor units; hours and leave days are hundredths of a unit.
// ============================================================================

export interface DepartmentDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  parentId: string | null;
  branchId: string | null;
  employeeCount?: number;
}

export interface JobTitleDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  departmentId: string | null;
}

export interface EmployeeDto {
  id: string;
  code: string;
  fullNameEn: string;
  fullNameAr: string;
  email: string | null;
  phone: string | null;
  status: string;
  hireDate: string;
  departmentId: string | null;
  departmentNameEn: string | null;
  departmentNameAr: string | null;
  jobTitleId: string | null;
  jobTitleNameEn: string | null;
  jobTitleNameAr: string | null;
  managerId: string | null;
  managerNameEn: string | null;
}

export interface LeaveTypeDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  annualEntitlementDays: number;
  isPaid: boolean;
  requiresApproval: boolean;
}

export interface LeaveRequestDto {
  id: string;
  employeeId: string;
  employeeCode: string | null;
  employeeNameEn: string | null;
  employeeNameAr: string | null;
  leaveTypeId: string;
  leaveTypeNameEn: string | null;
  leaveTypeNameAr: string | null;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  reason: string | null;
  decisionNote: string | null;
}

export interface ShiftDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface AttendanceDto {
  id: string;
  employeeId: string;
  employeeCode: string | null;
  employeeNameEn: string | null;
  workDate: string;
  workedMinutes: number;
  overtimeMinutes: number;
  status: string;
}

export interface PayrollPeriodDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
}

export interface PayrollRunDto {
  id: string;
  runNumber: string;
  status: string;
  employeeCount: number;
  grossMinor: number;
  allowancesMinor: number;
  deductionsMinor: number;
  netMinor: number;
  currency: string;
  journalEntryId: string | null;
  periodCode: string | null;
  periodNameEn: string | null;
  periodNameAr: string | null;
  payslipCount?: number;
  periodStart?: string;
  periodEnd?: string;
  payslips?: Array<Record<string, unknown>>;
  createdAt: string;
}

export interface EmployeeAdvanceDto {
  id: string;
  advanceNumber: string;
  employeeId: string;
  employeeCode: string | null;
  employeeNameEn: string | null;
  amountMinor: number;
  settledMinor: number;
  outstandingMinor: number;
  installments: number;
  status: string;
  currency: string;
  issuedAt: string;
  reason: string | null;
}

export interface HrDashboardDto {
  totalEmployees: number;
  activeEmployees: number;
  onLeaveEmployees: number;
  pendingLeaveRequests: number;
  departmentCount: number;
  headcountByDepartment: Array<{ departmentId: string | null; count: number }>;
  latestPayroll: { id: string; runNumber: string; status: string; netMinor: number; employeeCount: number } | null;
}

// ---------------------------------------------------------------------- CRM

export interface LeadDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  estimatedValueMinor: number;
  currency: string;
  ownerUserId: string | null;
  sourceNameEn: string | null;
  sourceNameAr: string | null;
  createdAt: string;
}

export interface PipelineStageDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  sortOrder: number;
  probabilityBp: number;
  isWon: boolean;
  isLost: boolean;
}

export interface PipelineDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  isDefault: boolean;
  stages: PipelineStageDto[];
}

export interface OpportunityDto {
  id: string;
  code: string;
  title: string;
  pipelineId: string;
  pipelineNameEn: string | null;
  stageId: string;
  stageNameEn: string | null;
  stageNameAr: string | null;
  probabilityBp: number;
  customerId: string | null;
  ownerUserId: string | null;
  amountMinor: number;
  currency: string;
  expectedCloseDate: string | null;
  status: string;
  quotationId: string | null;
  closedAt: string | null;
}

export interface SupportTicketDto {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  customerId: string | null;
  assignedToUserId: string | null;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  firstResponseAt: string | null;
  satisfactionScore: number | null;
  messageCount?: number;
  createdAt: string;
}

export interface CrmActivityDto {
  id: string;
  type: string;
  status: string;
  subject: string;
  notes: string | null;
  dueAt: string | null;
  completedAt: string | null;
  ownerUserId: string | null;
}

export interface CrmDashboardDto {
  totalLeads: number;
  openOpportunities: number;
  wonOpportunities: number;
  pipelineValueMinor: number;
  totalTickets: number;
  openTickets: number;
  overdueActivities: number;
  segmentCount: number;
  averageSatisfaction: number | null;
}

// --------------------------------------------------------------- Operations

export interface ProjectDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  status: string;
  ownerUserId: string | null;
  startDate: string | null;
  endDate: string | null;
  taskCount?: number;
}

export interface ProjectTaskDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeUserId: string | null;
  dueDate: string | null;
  completedAt: string | null;
}

export interface WorkOrderChecklistItemDto {
  id: string;
  label: string;
  isDone: boolean;
  sortOrder: number;
}

export interface WorkOrderDto {
  id: string;
  orderNumber: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  assigneeUserId: string | null;
  dueDate: string | null;
  checklist: WorkOrderChecklistItemDto[];
  comments?: Array<Record<string, unknown>>;
  attachments?: Array<Record<string, unknown>>;
  approvals?: Array<Record<string, unknown>>;
}

export interface OperationsDashboardDto {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  openTasks: number;
  overdueTasks: number;
  totalWorkOrders: number;
  workOrdersByStatus: Array<{ status: string; count: number }>;
  pendingApprovals: number;
  upcomingEvents: number;
}

// --------------------------------------------------------------- Automotive

export interface VehicleDto {
  id: string;
  customerId: string;
  customerCode: string | null;
  customerNameEn: string | null;
  customerNameAr: string | null;
  vin: string;
  plateNumber: string | null;
  make: string;
  model: string;
  modelYear: number;
  color: string | null;
  mileage: number;
  status: string;
  registrationExpiresAt: string | null;
}

export interface InspectionServiceDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  priceMinor: number;
  taxPercentBp: number;
  durationMinutes: number;
}

export interface InspectionBookingDto {
  id: string;
  bookingNumber: string;
  vehicleId: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  plateNumber: string | null;
  customerId: string;
  serviceId: string;
  serviceNameEn: string | null;
  serviceNameAr: string | null;
  status: string;
  scheduledAt: string;
  inspectorUserId: string | null;
  odometer: number | null;
  reportStatus: string | null;
  invoiceId: string | null;
  findingCount?: number;
}

export interface JobCardDto {
  id: string;
  jobNumber: string;
  vehicleId: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  plateNumber: string | null;
  customerId: string;
  status: string;
  technicianUserId: string | null;
  odometer: number | null;
  complaint: string | null;
  invoiceId: string | null;
  labourCount?: number;
  estimateCount?: number;
  reservationCount?: number;
  createdAt: string;
}

export interface PartsReservationDto {
  id: string;
  jobCardId: string;
  warehouseId: string;
  status: string;
  reservedAt: string;
  issuedAt: string | null;
  lines: Array<{ id: string; productId: string; quantity: number; issuedQuantity: number }>;
}

export interface MarketplaceProviderDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  categoryKey: string | null;
  status: string;
  commissionPercentBp: number;
  approvedAt: string | null;
  _count?: { listings: number; requests: number };
}

export interface ServiceRequestDto {
  id: string;
  requestNumber: string;
  categoryKey: string;
  status: string;
  providerId: string | null;
  provider?: { code: string; nameEn: string; nameAr: string; status: string } | null;
  createdAt: string;
}

export interface ProviderSettlementDto {
  id: string;
  providerId: string;
  periodStart: string;
  periodEnd: string;
  grossMinor: number;
  commissionMinor: number;
  netMinor: number;
  currency: string;
  status: string;
  provider?: { code: string; nameEn: string } | null;
}

// ============================================================================
// EXECUTION 05 — External Integrations Center
// ============================================================================

/** A credential as it may be shown to a client: never the real value. */
export interface IntegrationCredentialView {
  key: string;
  labelEn: string;
  labelAr: string;
  secret: boolean;
  required: boolean;
  /** True when a value is stored for this key. */
  configured: boolean;
  /** Last four characters of the stored value, when it is safe to show one. */
  hint: string | null;
  /** When the stored value was last changed. */
  updatedAt: string | null;
}

/** A provider plus the state of this deployment's configuration for it. */
export interface IntegrationProviderView {
  key: string;
  nameEn: string;
  nameAr: string;
  category: IntegrationCategory;
  descriptionEn: string;
  descriptionAr: string;
  implementation: IntegrationImplementation;
  configurable: boolean;
  perCompany: boolean;
  enabled: boolean;
  disabledReason: string | null;
  state: IntegrationProviderState;
  verificationStatus: IntegrationVerificationStatusDto;
  lastCheckedAt: string | null;
  lastCheckMessage: string | null;
  /** Credential keys that are required but have no stored value. */
  missingCredentials: string[];
  credentials: IntegrationCredentialView[];
  activationRequirementEn: string;
  activationRequirementAr: string;
}

export type IntegrationVerificationStatusDto = 'UNVERIFIED' | 'VERIFIED' | 'FAILED' | 'INCOMPLETE';

export interface IntegrationSummary {
  total: number;
  operational: number;
  configured: number;
  awaitingCredentials: number;
  disabled: number;
  error: number;
  /** Providers a customer-facing surface depends on that are not operational. */
  blockingForProduction: string[];
}

export interface IntegrationCenterResponse {
  providers: IntegrationProviderView[];
  summary: IntegrationSummary;
  /** Plain-language statement of what is and is not live. */
  noticeEn: string;
  noticeAr: string;
}

/** One provider plus its verification history. */
export interface IntegrationDetailResponse {
  provider: IntegrationProviderView;
  checks: IntegrationCheckDto[];
}

export interface IntegrationCheckDto {
  id: string;
  status: IntegrationVerificationStatusDto;
  message: string;
  durationMs: number;
  createdAt: string;
}

/** What a signed-in customer may actually choose, derived from provider state. */
export interface CustomerCapabilitiesResponse {
  payments: {
    cash: boolean;
    bankTransfer: boolean;
    benefitPay: boolean;
    cardOnline: boolean;
    cardTerminal: boolean;
  };
  channels: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
  };
}
