import type {
  AccountingReportDto,
  AgingRowDto,
  AppVersionDto,
  AuditLogDto,
  BalanceSheetDto,
  BranchDto,
  CashierSessionDto,
  CmsBannerDto,
  CmsPageDto,
  CompanyDto,
  ContextResponse,
  CustomerDto,
  DashboardResponse,
  ErpAccountDto,
  FeatureFlagDto,
  FiscalYearDto,
  IncomeStatementDto,
  InventoryReportDto,
  InvitationDto,
  JournalEntryDto,
  LedgerAccountDto,
  LoginResponse,
  LoginResult,
  ModuleDto,
  Paginated,
  PaymentDto,
  PlanDto,
  PosSaleDto,
  ProductDto,
  PurchaseDocumentDto,
  PurchasingReportDto,
  ReorderAlertDto,
  RequisitionDto,
  RoleDto,
  SalesDocumentDto,
  SalesReportDto,
  StockAdjustmentDto,
  StockMovementDto,
  StockTransferDto,
  SubscriptionDto,
  SupplierDto,
  TrialBalanceDto,
  UserDto,
  ValuationRowDto,
  WarehouseDto,
} from '@oryx/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api';

/**
 * Only non-secret UI preferences are persisted.
 *
 * No authentication token is ever written to localStorage, sessionStorage or
 * any other JavaScript-accessible persistent storage:
 *   - the refresh token lives in an HttpOnly cookie the browser never exposes;
 *   - the access token is held in memory for the lifetime of the tab and is
 *     re-acquired from the refresh cookie after a reload.
 */
const COMPANY_KEY = 'oryx.companyId';
const BRANCH_KEY = 'oryx.branchId';
/**
 * CSRF cookie name set by the API. It is intentionally readable by JavaScript
 * so the double-submit pattern works; it is not a credential on its own and is
 * useless without the HttpOnly refresh cookie.
 */
const CSRF_COOKIE = 'oryx_csrf';
const CSRF_HEADER = 'x-oryx-csrf';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * In-memory access token.
 *
 * Deliberately not backed by any storage API: a module-scoped variable is
 * discarded on navigation away from the app and on tab close, so an XSS payload
 * cannot read a persisted token from a later session. It survives client-side
 * route changes because the module instance does.
 *
 * On reload the token is gone, and the first authenticated request transparently
 * restores the session through the HttpOnly refresh cookie.
 */
let accessToken: string | null = null;

/** True when a session may exist and should be restored from the cookie. */
let sessionHinted = false;

/** Subscribers notified when the session is lost, so the UI can redirect. */
const sessionLossListeners = new Set<() => void>();

export const tokenStore = {
  get access(): string | null {
    return accessToken;
  },
  get hasSessionHint(): boolean {
    return sessionHinted;
  },
  get companyId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(COMPANY_KEY);
  },
  get branchId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(BRANCH_KEY);
  },
  setAccessToken(token: string) {
    accessToken = token;
    sessionHinted = true;
  },
  /** Record that a session is expected, without storing any token. */
  markSessionHint() {
    sessionHinted = true;
  },
  setContext(companyId: string | null, branchId: string | null) {
    if (typeof window === 'undefined') return;
    if (companyId) window.localStorage.setItem(COMPANY_KEY, companyId);
    else window.localStorage.removeItem(COMPANY_KEY);
    if (branchId) window.localStorage.setItem(BRANCH_KEY, branchId);
    else window.localStorage.removeItem(BRANCH_KEY);
  },
  /** Drop the in-memory token and the session hint. */
  clear() {
    accessToken = null;
    sessionHinted = false;
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(COMPANY_KEY);
    window.localStorage.removeItem(BRANCH_KEY);
  },
  /** Remove only the in-memory token, keeping UI context. */
  clearAccessToken() {
    accessToken = null;
  },
  onSessionLost(listener: () => void): () => void {
    sessionLossListeners.add(listener);
    return () => sessionLossListeners.delete(listener);
  },
  notifySessionLost() {
    sessionHinted = false;
    accessToken = null;
    for (const listener of sessionLossListeners) listener();
  },
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skip the Authorization header (login, public content). */
  anonymous?: boolean;
  /** Do not attempt a refresh-and-retry on 401. */
  noRetry?: boolean;
}

/**
 * Single-flight refresh.
 *
 * Every caller that needs a new access token awaits the same promise, so
 * concurrent 401s across widgets produce exactly one rotation request. This is
 * what prevents a refresh storm and the token-family revocation it would cause.
 */
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Rotate the session using the HttpOnly refresh cookie. The CSRF header must
 * accompany the request, which is why it is read from the readable cookie.
 */
async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const csrf = readCookie(CSRF_COOKIE);
        const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
          method: 'POST',
          // Send and receive the session cookies.
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
          },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          tokenStore.clear();
          return false;
        }
        const data = (await res.json()) as LoginResponse;
        tokenStore.setAccessToken(data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/**
 * Restore a session after a reload.
 *
 * Called once when the app mounts. It performs a single refresh so the tab has
 * an access token again; a failure simply means there is no session.
 */
export async function restoreSession(): Promise<boolean> {
  if (accessToken) return true;
  return refreshSession();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous) {
    const token = tokenStore.access;
    if (token) headers.Authorization = `Bearer ${token}`;
    const companyId = tokenStore.companyId;
    const branchId = tokenStore.branchId;
    if (companyId) headers['x-oryx-company-id'] = companyId;
    if (branchId) headers['x-oryx-branch-id'] = branchId;
  }
  // Echo the CSRF cookie on state-changing requests (double-submit).
  if (method !== 'GET') {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  const res = await fetch(`${API_BASE}/v1${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (res.status === 401 && !options.anonymous && !options.noRetry) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, { ...options, noRetry: true });
    // The session is genuinely gone: tell the shell so it can redirect.
    tokenStore.notifySessionLost();
  }

  if (!res.ok) {
    let body: { message?: string | string[]; code?: string; error?: string; details?: Record<string, unknown> } = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message ?? body.error ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, body.code ?? 'unknown_error', message, body.details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // ------------------------------------------------------------------- auth
  login: (email: string, password: string) =>
    request<LoginResult>('/auth/login', { method: 'POST', body: { email, password }, anonymous: true }),
  verifyMfaLogin: (challengeToken: string, code: string) =>
    request<LoginResponse>('/auth/mfa/verify-login', {
      method: 'POST',
      body: { challengeToken, code },
      anonymous: true,
    }),
  me: () =>
    request<{
      user: {
        id: string;
        email: string;
        fullNameEn: string;
        fullNameAr: string;
        status: string;
        isSuperAdmin: boolean;
        preferredLocale: 'ar' | 'en';
        preferredTheme: 'dark' | 'light';
      };
      memberships: unknown[];
      permissions: string[];
      mfa: { enabled: boolean; enrolledAt: string | null; recoveryCodesRemaining: number };
      context: {
        companyId: string | null;
        branchId: string | null;
        licensedModules: string[];
        supportSessionCompanyId: string | null;
      };
    }>('/auth/me'),
  context: () => request<ContextResponse>('/auth/context'),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: {} }),
  updateProfile: (body: {
    fullNameEn?: string;
    fullNameAr?: string;
    preferredLocale?: 'ar' | 'en';
    preferredTheme?: 'dark' | 'light';
  }) => request<{ id: string; preferredLocale: 'ar' | 'en'; preferredTheme: 'dark' | 'light' }>(
    '/auth/profile',
    { method: 'PATCH', body },
  ),
  acceptInvitation: (body: {
    token: string;
    fullNameEn: string;
    fullNameAr: string;
    password: string;
  }) => request<LoginResult>('/auth/accept-invitation', { method: 'POST', body, anonymous: true }),

  // -------------------------------------------------------------------- MFA
  mfaStatus: () =>
    request<{ enabled: boolean; enrolledAt: string | null; recoveryCodesRemaining: number }>('/auth/mfa/status'),
  mfaStartEnrollment: () =>
    request<{ otpauthUri: string; qrDataUrl: string; secret: string; expiresAt: string }>('/auth/mfa/enroll', {
      method: 'POST',
      body: {},
    }),
  mfaConfirmEnrollment: (code: string) =>
    request<{ recoveryCodes: string[] }>('/auth/mfa/enroll/confirm', { method: 'POST', body: { code } }),
  mfaRegenerateRecoveryCodes: (code: string) =>
    request<{ recoveryCodes: string[] }>('/auth/mfa/recovery-codes/regenerate', {
      method: 'POST',
      body: { code },
    }),
  mfaDisable: (code: string) => request<{ ok: boolean }>('/auth/mfa/disable', { method: 'POST', body: { code } }),
  mfaAdminReset: (userId: string) =>
    request<{ ok: boolean }>(`/auth/mfa/reset/${userId}`, { method: 'POST', body: {} }),

  // ---------------------------------------------------------------- dashboard
  dashboard: (params: { companyId?: string | null; branchId?: string | null } = {}) => {
    const q = new URLSearchParams();
    if (params.companyId) q.set('companyId', params.companyId);
    if (params.branchId) q.set('branchId', params.branchId);
    const qs = q.toString();
    return request<DashboardResponse>(`/dashboard${qs ? `?${qs}` : ''}`);
  },

  // -------------------------------------------------------------- companies
  listCompanies: (params: { page?: number; pageSize?: number; search?: string; status?: string; type?: string } = {}) =>
    request<Paginated<CompanyDto>>(`/companies?${toQuery(params)}`),
  getCompany: (id: string) => request<CompanyDto>(`/companies/${id}`),
  createCompany: (body: Record<string, unknown>) =>
    request<{ company: CompanyDto; adminEmail?: string }>('/companies', { method: 'POST', body }),
  updateCompany: (id: string, body: Record<string, unknown>) =>
    request<CompanyDto>(`/companies/${id}`, { method: 'PATCH', body }),
  setCompanyStatus: (id: string, status: string, reason?: string) =>
    request<CompanyDto>(`/companies/${id}/status`, { method: 'PATCH', body: { status, reason } }),

  // ---------------------------------------------------------------- branches
  listBranches: (companyId: string, params: { page?: number; pageSize?: number; search?: string } = {}) =>
    request<Paginated<BranchDto>>(`/companies/${companyId}/branches?${toQuery(params)}`),
  createBranch: (companyId: string, body: Record<string, unknown>) =>
    request<BranchDto>(`/companies/${companyId}/branches`, { method: 'POST', body }),
  updateBranch: (id: string, body: Record<string, unknown>) =>
    request<BranchDto>(`/branches/${id}`, { method: 'PATCH', body }),
  deleteBranch: (id: string) => request<{ ok: boolean }>(`/branches/${id}`, { method: 'DELETE' }),

  // ------------------------------------------------------- roles/permissions
  permissionCatalog: () =>
    request<{
      groups: string[];
      permissions: Array<{
        code: string;
        group: string;
        labelEn: string;
        labelAr: string;
        scope: string;
        delegable: boolean;
        moduleKey: string | null;
        descriptionEn: string;
      }>;
    }>('/permissions/catalog'),
  delegablePermissions: (companyId: string) =>
    request<{ companyId: string; permissions: string[] }>(`/permissions/delegable?companyId=${companyId}`),
  listRoles: (companyId: string) => request<RoleDto[]>(`/companies/${companyId}/roles`),
  createRole: (companyId: string, body: Record<string, unknown>) =>
    request<RoleDto>(`/companies/${companyId}/roles`, { method: 'POST', body }),
  updateRole: (id: string, body: Record<string, unknown>) =>
    request<RoleDto>(`/roles/${id}`, { method: 'PATCH', body }),
  deleteRole: (id: string) => request<{ ok: boolean }>(`/roles/${id}`, { method: 'DELETE' }),

  // ------------------------------------------------------------------- users
  listUsers: (companyId: string, params: { page?: number; pageSize?: number; search?: string; status?: string } = {}) =>
    request<Paginated<UserDto>>(`/companies/${companyId}/users?${toQuery(params)}`),
  inviteUser: (companyId: string, body: Record<string, unknown>) =>
    request<InvitationDto>(`/companies/${companyId}/users/invitations`, { method: 'POST', body }),
  listInvitations: (companyId: string) => request<InvitationDto[]>(`/companies/${companyId}/users/invitations`),
  revokeInvitation: (id: string) =>
    request<{ ok: boolean }>(`/invitations/${id}/revoke`, { method: 'POST' }),
  effectivePermissions: (companyId: string, userId: string) =>
    request<{
      userId: string;
      email: string;
      role: { id: string; nameEn: string; nameAr: string };
      branchIds: string[];
      granted: string[];
      effective: string[];
      suppressedByEntitlement: Array<{ code: string; reason: string }>;
      licensedModules: string[];
    }>(`/companies/${companyId}/users/${userId}/effective-permissions`),
  updateMembership: (companyId: string, userId: string, body: Record<string, unknown>) =>
    request<unknown>(`/companies/${companyId}/users/${userId}/membership`, { method: 'PATCH', body }),

  // ----------------------------------------------------------------- modules
  listModules: () => request<{ items: Array<ModuleDto & { licensed: boolean }> }>('/modules'),
  entitlements: (companyId?: string) =>
    request<{
      companyId: string;
      planId: string | null;
      planCode: string | null;
      status: string | null;
      licensedModules: string[];
      limits: Record<string, number>;
      usage: { branches: number; users: number; companies: number };
      isActive: boolean;
    }>(`/modules/entitlements${companyId ? `?companyId=${companyId}` : ''}`),

  // ------------------------------------------------------- plans/subscriptions
  listPlans: () => request<PlanDto[]>('/plans'),
  createPlan: (body: Record<string, unknown>) => request<PlanDto>('/plans', { method: 'POST', body }),
  updatePlan: (id: string, body: Record<string, unknown>) =>
    request<PlanDto>(`/plans/${id}`, { method: 'PATCH', body }),
  listSubscriptions: (params: { companyId?: string; status?: string } = {}) =>
    request<Array<SubscriptionDto & { events: Array<Record<string, unknown>> }>>(
      `/subscriptions?${toQuery(params)}`,
    ),
  assignSubscription: (companyId: string, body: Record<string, unknown>) =>
    request<{ id: string; status: string; licensedModules: string[] }>(
      `/subscriptions/companies/${companyId}/assign`,
      { method: 'POST', body },
    ),
  changeSubscriptionStatus: (id: string, status: string, note?: string) =>
    request<{ id: string; status: string; licensedModules: string[] }>(`/subscriptions/${id}/status`, {
      method: 'PATCH',
      body: { status, note },
    }),

  // ------------------------------------------------------------------- audit
  listAuditLogs: (params: { page?: number; pageSize?: number; companyId?: string; action?: string } = {}) =>
    request<Paginated<AuditLogDto>>(`/audit-logs?${toQuery(params)}`),

  // --------------------------------------------------------------------- cms
  cmsPages: (locale?: string) => request<CmsPageDto[]>(`/cms/pages${locale ? `?locale=${locale}` : ''}`),
  upsertCmsPage: (body: Record<string, unknown>) => request<CmsPageDto>('/cms/pages', { method: 'PUT', body }),
  deleteCmsPage: (id: string) => request<{ ok: boolean }>(`/cms/pages/${id}`, { method: 'DELETE' }),
  cmsBanners: (placement?: string) =>
    request<CmsBannerDto[]>(`/cms/banners${placement ? `?placement=${placement}` : ''}`),
  upsertCmsBanner: (body: Record<string, unknown>) => request<CmsBannerDto>('/cms/banners', { method: 'PUT', body }),
  featureFlags: () => request<FeatureFlagDto[]>('/cms/feature-flags'),
  upsertFeatureFlag: (body: Record<string, unknown>) =>
    request<FeatureFlagDto>('/cms/feature-flags', { method: 'PUT', body }),
  appVersions: () => request<AppVersionDto[]>('/cms/app-versions'),
  upsertAppVersion: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/cms/app-versions', { method: 'PUT', body }),
  serviceCategories: () => request<Array<Record<string, unknown>>>('/cms/service-categories'),
  notificationTemplates: () => request<Array<Record<string, unknown>>>('/cms/notification-templates'),
  apiClients: () => request<Array<Record<string, unknown>>>('/cms/api-clients'),
  createApiClient: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/cms/api-clients', { method: 'POST', body }),
  revokeApiClient: (id: string) =>
    request<{ ok: boolean }>(`/cms/api-clients/${id}/revoke`, { method: 'POST', body: {} }),

  // ----------------------------------------------------------------- support
  supportSessions: () => request<Array<Record<string, unknown>>>('/support-sessions'),
  openSupportSession: (body: { companyId: string; reason: string; minutes?: number }) =>
    request<Record<string, unknown>>('/support-sessions', { method: 'POST', body }),
  endSupportSession: (id: string) =>
    request<{ ok: boolean }>(`/support-sessions/${id}/end`, { method: 'POST' }),

  // ------------------------------------------------------- accounting (E02)
  accountingAccounts: (params: { companyId?: string; search?: string } = {}) =>
    request<Paginated<ErpAccountDto>>(`/accounting/accounts?${toQuery(params)}`),
  createAccount: (body: Record<string, unknown>) =>
    request<ErpAccountDto>('/accounting/accounts', { method: 'POST', body }),
  updateAccount: (id: string, body: Record<string, unknown>) =>
    request<ErpAccountDto>(`/accounting/accounts/${id}`, { method: 'PATCH', body }),
  seedStandardChart: () =>
    request<{ created: number }>('/accounting/accounts/seed-standard-chart', { method: 'POST', body: {} }),
  fiscalYears: (companyId?: string) =>
    request<FiscalYearDto[]>(`/accounting/fiscal-years${companyId ? `?companyId=${companyId}` : ''}`),
  createFiscalYear: (body: Record<string, unknown>) =>
    request<{ id: string; code: string; periods: number }>('/accounting/fiscal-years', { method: 'POST', body }),
  setPeriodStatus: (id: string, status: string) =>
    request<{ id: string; status: string }>(`/accounting/fiscal-periods/${id}/status`, {
      method: 'PATCH',
      body: { status },
    }),
  journals: (params: { companyId?: string; status?: string; search?: string; page?: number; pageSize?: number } = {}) =>
    request<Paginated<JournalEntryDto>>(`/accounting/journals?${toQuery(params)}`),
  createJournal: (body: Record<string, unknown>) =>
    request<{ id: string; entryNumber: string }>('/accounting/journals', { method: 'POST', body }),
  reverseJournal: (id: string, reason?: string) =>
    request<{ entryNumber: string }>(`/accounting/journals/${id}/reverse`, {
      method: 'POST',
      body: { reason },
    }),
  generalLedger: (params: { accountId?: string; from?: string; to?: string; companyId?: string } = {}) =>
    request<{ accounts: LedgerAccountDto[] }>(`/accounting/general-ledger?${toQuery(params)}`),
  trialBalance: (params: { from?: string; to?: string; companyId?: string } = {}) =>
    request<TrialBalanceDto>(`/accounting/trial-balance?${toQuery(params)}`),
  incomeStatement: (params: { from?: string; to?: string; companyId?: string } = {}) =>
    request<IncomeStatementDto>(`/accounting/income-statement?${toQuery(params)}`),
  balanceSheet: (params: { asOf?: string; companyId?: string } = {}) =>
    request<BalanceSheetDto>(`/accounting/balance-sheet?${toQuery(params)}`),
  receivablesAging: (companyId?: string) =>
    request<AgingRowDto[]>(`/accounting/receivables-aging${companyId ? `?companyId=${companyId}` : ''}`),
  payablesAging: (companyId?: string) =>
    request<AgingRowDto[]>(`/accounting/payables-aging${companyId ? `?companyId=${companyId}` : ''}`),
  payments: (params: { companyId?: string; page?: number } = {}) =>
    request<Paginated<PaymentDto>>(`/accounting/payments?${toQuery(params)}`),
  recordPayment: (body: Record<string, unknown>) =>
    request<PaymentDto>('/accounting/payments', { method: 'POST', body }),

  // -------------------------------------------------------- inventory (E02)
  warehouses: (params: { companyId?: string } = {}) =>
    request<Paginated<WarehouseDto>>(`/inventory/warehouses?${toQuery(params)}`),
  createWarehouse: (body: Record<string, unknown>) =>
    request<WarehouseDto>('/inventory/warehouses', { method: 'POST', body }),
  updateWarehouse: (id: string, body: Record<string, unknown>) =>
    request<WarehouseDto>(`/inventory/warehouses/${id}`, { method: 'PATCH', body }),
  products: (params: { companyId?: string; search?: string } = {}) =>
    request<Paginated<ProductDto>>(`/inventory/products?${toQuery(params)}`),
  createProduct: (body: Record<string, unknown>) =>
    request<ProductDto>('/inventory/products', { method: 'POST', body }),
  updateProduct: (id: string, body: Record<string, unknown>) =>
    request<ProductDto>(`/inventory/products/${id}`, { method: 'PATCH', body }),
  stockMovements: (params: { companyId?: string; page?: number } = {}) =>
    request<Paginated<StockMovementDto>>(`/inventory/movements?${toQuery(params)}`),
  recordStockMovement: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/movements', { method: 'POST', body }),
  stockTransfers: (params: { companyId?: string } = {}) =>
    request<Paginated<StockTransferDto>>(`/inventory/transfers?${toQuery(params)}`),
  createStockTransfer: (body: Record<string, unknown>) =>
    request<StockTransferDto>('/inventory/transfers', { method: 'POST', body }),
  postStockTransfer: (id: string) =>
    request<StockTransferDto>(`/inventory/transfers/${id}/post`, { method: 'POST', body: {} }),
  stockAdjustments: (params: { companyId?: string } = {}) =>
    request<Paginated<StockAdjustmentDto>>(`/inventory/adjustments?${toQuery(params)}`),
  createStockAdjustment: (body: Record<string, unknown>) =>
    request<StockAdjustmentDto>('/inventory/adjustments', { method: 'POST', body }),
  postStockAdjustment: (id: string) =>
    request<StockAdjustmentDto>(`/inventory/adjustments/${id}/post`, { method: 'POST', body: {} }),
  inventoryValuation: (companyId?: string) =>
    request<{ rows: ValuationRowDto[]; totalValueMinor: number; totalQuantity: number }>(
      `/inventory/valuation${companyId ? `?companyId=${companyId}` : ''}`,
    ),
  reorderAlerts: (companyId?: string) =>
    request<{ items: ReorderAlertDto[] }>(`/inventory/reorder-alerts${companyId ? `?companyId=${companyId}` : ''}`),

  // ------------------------------------------------------------ sales (E02)
  salesCustomers: (params: { companyId?: string; search?: string } = {}) =>
    request<Paginated<CustomerDto>>(`/sales/customers?${toQuery(params)}`),
  createCustomer: (body: Record<string, unknown>) =>
    request<CustomerDto>('/sales/customers', { method: 'POST', body }),
  updateCustomer: (id: string, body: Record<string, unknown>) =>
    request<CustomerDto>(`/sales/customers/${id}`, { method: 'POST', body }),
  quotations: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<SalesDocumentDto>>(`/sales/quotations?${toQuery(params)}`),
  createQuotation: (body: Record<string, unknown>) =>
    request<SalesDocumentDto>('/sales/quotations', { method: 'POST', body }),
  convertQuotation: (id: string, warehouseId?: string) =>
    request<SalesDocumentDto>(`/sales/quotations/${id}/convert`, { method: 'POST', body: { warehouseId } }),
  salesOrders: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<SalesDocumentDto>>(`/sales/orders?${toQuery(params)}`),
  createSalesOrder: (body: Record<string, unknown>) =>
    request<SalesDocumentDto>('/sales/orders', { method: 'POST', body }),
  salesInvoices: (params: { companyId?: string; status?: string; page?: number } = {}) =>
    request<Paginated<SalesDocumentDto>>(`/sales/invoices?${toQuery(params)}`),
  getSalesInvoice: (id: string) => request<SalesDocumentDto>(`/sales/invoices/${id}`),
  createSalesInvoice: (body: Record<string, unknown>) =>
    request<SalesDocumentDto>('/sales/invoices', { method: 'POST', body }),
  creditNotes: (params: { companyId?: string } = {}) =>
    request<Paginated<SalesDocumentDto>>(`/sales/credit-notes?${toQuery(params)}`),
  createCreditNote: (body: Record<string, unknown>) =>
    request<SalesDocumentDto>('/sales/credit-notes', { method: 'POST', body }),
  cashierSessions: (params: { companyId?: string } = {}) =>
    request<Paginated<CashierSessionDto>>(`/sales/cashier-sessions?${toQuery(params)}`),
  openCashierSession: (body: Record<string, unknown>) =>
    request<CashierSessionDto>('/sales/cashier-sessions', { method: 'POST', body }),
  closeCashierSession: (id: string, countedCashMinor: number, notes?: string) =>
    request<CashierSessionDto>(`/sales/cashier-sessions/${id}/close`, {
      method: 'POST',
      body: { countedCashMinor, notes },
    }),
  posSales: (params: { companyId?: string; page?: number } = {}) =>
    request<Paginated<PosSaleDto>>(`/sales/pos-sales?${toQuery(params)}`),
  createPosSale: (body: Record<string, unknown>) =>
    request<PosSaleDto>('/sales/pos-sales', { method: 'POST', body }),

  // ------------------------------------------------------- purchasing (E02)
  suppliers: (params: { companyId?: string; search?: string } = {}) =>
    request<Paginated<SupplierDto>>(`/purchasing/suppliers?${toQuery(params)}`),
  createSupplier: (body: Record<string, unknown>) =>
    request<SupplierDto>('/purchasing/suppliers', { method: 'POST', body }),
  updateSupplier: (id: string, body: Record<string, unknown>) =>
    request<SupplierDto>(`/purchasing/suppliers/${id}`, { method: 'POST', body }),
  requisitions: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<RequisitionDto>>(`/purchasing/requisitions?${toQuery(params)}`),
  createRequisition: (body: Record<string, unknown>) =>
    request<RequisitionDto>('/purchasing/requisitions', { method: 'POST', body }),
  approveRequisition: (id: string) =>
    request<RequisitionDto>(`/purchasing/requisitions/${id}/approve`, { method: 'POST', body: {} }),
  convertRequisition: (id: string, supplierId: string) =>
    request<PurchaseDocumentDto>(`/purchasing/requisitions/${id}/convert`, { method: 'POST', body: { supplierId } }),
  purchaseOrders: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<PurchaseDocumentDto>>(`/purchasing/orders?${toQuery(params)}`),
  createPurchaseOrder: (body: Record<string, unknown>) =>
    request<PurchaseDocumentDto>('/purchasing/orders', { method: 'POST', body }),
  approvePurchaseOrder: (id: string) =>
    request<PurchaseDocumentDto>(`/purchasing/orders/${id}/approve`, { method: 'POST', body: {} }),
  goodsReceipts: (params: { companyId?: string } = {}) =>
    request<Paginated<PurchaseDocumentDto>>(`/purchasing/receipts?${toQuery(params)}`),
  createGoodsReceipt: (body: Record<string, unknown>) =>
    request<PurchaseDocumentDto>('/purchasing/receipts', { method: 'POST', body }),
  supplierInvoices: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<PurchaseDocumentDto>>(`/purchasing/supplier-invoices?${toQuery(params)}`),
  createSupplierInvoice: (body: Record<string, unknown>) =>
    request<PurchaseDocumentDto>('/purchasing/supplier-invoices', { method: 'POST', body }),
  purchaseReturns: (params: { companyId?: string } = {}) =>
    request<Paginated<PurchaseDocumentDto>>(`/purchasing/returns?${toQuery(params)}`),
  createPurchaseReturn: (body: Record<string, unknown>) =>
    request<PurchaseDocumentDto>('/purchasing/returns', { method: 'POST', body }),

  // ---------------------------------------------------------- reports (E02)
  reportAccounting: (params: Record<string, unknown> = {}) =>
    request<AccountingReportDto>(`/reports/accounting?${toQuery(params)}`),
  reportSales: (params: Record<string, unknown> = {}) =>
    request<SalesReportDto>(`/reports/sales?${toQuery(params)}`),
  reportPurchasing: (params: Record<string, unknown> = {}) =>
    request<PurchasingReportDto>(`/reports/purchasing?${toQuery(params)}`),
  reportInventory: (params: Record<string, unknown> = {}) =>
    request<InventoryReportDto>(`/reports/inventory?${toQuery(params)}`),
};

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    q.set(key, String(value));
  }
  return q.toString();
}
