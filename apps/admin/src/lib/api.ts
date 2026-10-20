import type {
  AccountingReportDto,
  AgingRowDto,
  AppVersionDto,
  AuditLogDto,
  BalanceSheetDto,
  BranchDto,
  CashierSessionDto,
  CmsBannerDto,
  CmsMediaAssetDto,
  CmsMediaFolderDto,
  CmsPageDto,
  CompanyDto,
  ContextResponse,
  CustomerDto,
  DashboardResponse,
  ErpAccountDto,
  FeatureFlagDto,
  FiscalYearDto,
  IncomeStatementDto,
  IntegrationCenterResponse,
  IntegrationDetailResponse,
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
  DepartmentDto,
  JobTitleDto,
  EmployeeDto,
  LeaveTypeDto,
  LeaveRequestDto,
  ShiftDto,
  AttendanceDto,
  PayrollPeriodDto,
  PayrollRunDto,
  EmployeeAdvanceDto,
  HrDashboardDto,
  LeadDto,
  PipelineDto,
  OpportunityDto,
  SupportTicketDto,
  CrmActivityDto,
  CrmDashboardDto,
  ProjectDto,
  ProjectTaskDto,
  WorkOrderDto,
  WorkOrderChecklistItemDto,
  OperationsDashboardDto,
  VehicleDto,
  InspectionServiceDto,
  InspectionBookingDto,
  JobCardDto,
  PartsReservationDto,
  MarketplaceProviderDto,
  ServiceRequestDto,
  ProviderSettlementDto,
  WarehouseDto,
} from '@oryx/shared';

/**
 * Base URL every admin request is built from. Callers append `/v1/<path>`.
 *
 * A value that already ends in `/v1` would produce `/api/v1/v1/auth/login` — a
 * 404 that reads like a routing bug. That is a pure configuration mistake (the
 * documented value is the origin plus `/api`), so it is normalised here rather
 * than left to fail at runtime. Trailing slashes are trimmed for the same
 * reason.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api')
  .replace(/\/+$/, '')
  .replace(/\/v1$/, '');

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

/**
 * Subscribers notified when the API is unreachable but the session may still be
 * valid. Distinct from session loss on purpose: a transient outage must not
 * redirect the user to sign-in.
 */
const offlineListeners = new Set<() => void>();

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
  /**
   * Report a transient outage. Unlike `notifySessionLost` this deliberately
   * keeps the in-memory token and the session hint: the session is probably
   * still valid and the next successful request should continue seamlessly.
   */
  onOffline(listener: () => void): () => void {
    offlineListeners.add(listener);
    return () => offlineListeners.delete(listener);
  },
  notifyOffline() {
    for (const listener of offlineListeners) listener();
  },
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skip the Authorization header (login, public content). */
  anonymous?: boolean;
  /** Do not attempt a refresh-and-retry on 401. */
  noRetry?: boolean;
  /**
   * Send the body as-is (a `FormData` upload) instead of JSON-encoding it. The
   * browser must set the multipart boundary itself, so no Content-Type is set.
   */
  raw?: boolean;
}

/**
 * Single-flight refresh.
 *
 * Every caller that needs a new access token awaits the same promise, so
 * concurrent 401s across widgets produce exactly one rotation request. This is
 * what prevents a refresh storm and the token-family revocation it would cause.
 *
 * The result distinguishes three outcomes:
 *   - `ok`          a new access token was obtained;
 *   - `expired`     the API rejected the refresh token (401/403), so the
 *                   session really is over and the shell should sign out;
 *   - `unavailable` the refresh could not be attempted or answered — an offline
 *                   network, a timeout, a 5xx or a 429. The session may still be
 *                   perfectly valid, so it must NOT be torn down.
 *
 * Collapsing `unavailable` into `expired` was the defect behind the iPad
 * incident: one transient failure signed the user out and, because the stale
 * HttpOnly cookie could not be cleared from script, the guard then blocked
 * every subsequent sign-in.
 */
export type RefreshOutcome = 'ok' | 'expired' | 'unavailable';

let refreshInFlight: Promise<RefreshOutcome> | null = null;

/** Only an explicit rejection by the API means the session is over. */
function isTerminalRefreshStatus(status: number): boolean {
  return status === 401 || status === 403;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<RefreshOutcome> => {
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
        if (res.ok) {
          const data = (await res.json()) as LoginResponse;
          tokenStore.setAccessToken(data.accessToken);
          return 'ok';
        }
        if (isTerminalRefreshStatus(res.status)) {
          tokenStore.clear();
          return 'expired';
        }
        // 5xx, 429 or any other unexpected status: retryable, not terminal.
        return 'unavailable';
      } catch {
        // A thrown fetch is a network/DNS/offline failure, never a rejection.
        return 'unavailable';
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/** Bounded retries so a brief outage does not look like a lost session. */
const RESTORE_ATTEMPTS = 3;
const RESTORE_BACKOFF_MS = 600;

/**
 * Restore a session after a reload.
 *
 * Called once when the app mounts. A `401`/`403` means there is genuinely no
 * session; a transient failure is retried a bounded number of times before it
 * is reported, so a flaky network at boot does not bounce the user to sign-in.
 */
export async function restoreSession(): Promise<RefreshOutcome> {
  if (accessToken) return 'ok';
  let outcome: RefreshOutcome = 'unavailable';
  for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt += 1) {
    outcome = await refreshSession();
    if (outcome !== 'unavailable') return outcome;
    if (attempt < RESTORE_ATTEMPTS - 1) await sleep(RESTORE_BACKOFF_MS * (attempt + 1));
  }
  return outcome;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  // A raw body is a multipart upload: the browser sets the boundary, so no
  // Content-Type may be written here or the request is rejected as malformed.
  if (options.body !== undefined && !options.raw) headers['Content-Type'] = 'application/json';
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
    body:
      options.body === undefined
        ? undefined
        : options.raw
          ? (options.body as BodyInit)
          : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (res.status === 401 && !options.anonymous && !options.noRetry) {
    const outcome = await refreshSession();
    if (outcome === 'ok') return request<T>(path, { ...options, noRetry: true });
    if (outcome === 'expired') {
      // The API explicitly rejected the refresh token: the session is gone.
      tokenStore.notifySessionLost();
    } else {
      // Transient failure. The session may still be valid, so surface the
      // problem instead of signing the user out. `noRetry` prevents a loop.
      tokenStore.notifyOffline();
      throw new ApiError(503, 'network.unavailable', 'The service is temporarily unavailable.');
    }
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
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>('/auth/change-password', { method: 'POST', body }),

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

  // ------------------------------------------------------------ media library
  mediaFolders: () => request<CmsMediaFolderDto[]>('/cms/media/folders'),
  upsertMediaFolder: (body: Record<string, unknown>) =>
    request<CmsMediaFolderDto>('/cms/media/folders', { method: 'PUT', body }),
  deleteMediaFolder: (id: string) =>
    request<{ ok: boolean }>(`/cms/media/folders/${id}`, { method: 'DELETE' }),
  mediaAssets: (params: { folderId?: string; search?: string; page?: number; pageSize?: number } = {}) =>
    request<Paginated<CmsMediaAssetDto>>(`/cms/media?${toQuery(params)}`),
  mediaAsset: (id: string) => request<CmsMediaAssetDto>(`/cms/media/${id}`),
  /**
   * Upload an image. Sent as multipart/form-data so the browser streams the
   * file; `request` must not set a JSON content type here.
   */
  uploadMedia: (form: FormData) =>
    request<CmsMediaAssetDto>('/cms/media', { method: 'POST', body: form, raw: true }),
  updateMedia: (id: string, body: Record<string, unknown>) =>
    request<CmsMediaAssetDto>(`/cms/media/${id}`, { method: 'PATCH', body }),
  deleteMedia: (id: string) => request<{ ok: boolean }>(`/cms/media/${id}`, { method: 'DELETE' }),
  /** The servable URL of an image variant (`card` by default). */
  mediaFileUrl: (id: string, variant = 'card') => `${API_BASE}/v1/cms/media/${id}/file?variant=${variant}`,

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

  // ------------------------------------------------------------- HR (E03)
  hrDepartments: (params: { companyId?: string } = {}) =>
    request<Paginated<DepartmentDto>>(`/hr/departments?${toQuery(params)}`),
  createDepartment: (body: Record<string, unknown>) => request<DepartmentDto>('/hr/departments', { method: 'POST', body }),
  hrJobTitles: (params: { companyId?: string } = {}) =>
    request<Paginated<JobTitleDto>>(`/hr/job-titles?${toQuery(params)}`),
  createJobTitle: (body: Record<string, unknown>) => request<JobTitleDto>('/hr/job-titles', { method: 'POST', body }),
  hrEmployees: (params: { companyId?: string; search?: string; status?: string; page?: number } = {}) =>
    request<Paginated<EmployeeDto>>(`/hr/employees?${toQuery(params)}`),
  hrEmployee: (id: string) => request<Record<string, unknown>>(`/hr/employees/${id}`),
  createEmployee: (body: Record<string, unknown>) => request<EmployeeDto>('/hr/employees', { method: 'POST', body }),
  updateEmployee: (id: string, body: Record<string, unknown>) =>
    request<EmployeeDto>(`/hr/employees/${id}`, { method: 'PATCH', body }),
  createContract: (employeeId: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/hr/employees/${employeeId}/contracts`, { method: 'POST', body }),
  employeeDocuments: (employeeId: string) =>
    request<Paginated<Record<string, unknown>>>(`/hr/employees/${employeeId}/documents`),
  createEmployeeDocument: (employeeId: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/hr/employees/${employeeId}/documents`, { method: 'POST', body }),
  leaveTypes: (params: { companyId?: string } = {}) =>
    request<Paginated<LeaveTypeDto>>(`/hr/leave-types?${toQuery(params)}`),
  createLeaveType: (body: Record<string, unknown>) => request<LeaveTypeDto>('/hr/leave-types', { method: 'POST', body }),
  leaveRequests: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<LeaveRequestDto>>(`/hr/leave-requests?${toQuery(params)}`),
  requestLeave: (body: Record<string, unknown>) => request<LeaveRequestDto>('/hr/leave-requests', { method: 'POST', body }),
  decideLeave: (id: string, decision: string, note?: string) =>
    request<LeaveRequestDto>(`/hr/leave-requests/${id}/decide`, { method: 'POST', body: { decision, note } }),
  hrShifts: (params: { companyId?: string } = {}) => request<Paginated<ShiftDto>>(`/hr/shifts?${toQuery(params)}`),
  createShift: (body: Record<string, unknown>) => request<ShiftDto>('/hr/shifts', { method: 'POST', body }),
  hrAttendance: (params: { companyId?: string } = {}) =>
    request<Paginated<AttendanceDto>>(`/hr/attendance?${toQuery(params)}`),
  recordAttendance: (body: Record<string, unknown>) =>
    request<AttendanceDto>('/hr/attendance', { method: 'POST', body }),
  createSalaryStructure: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/hr/salary-structures', { method: 'POST', body }),
  payrollPeriods: (params: { companyId?: string } = {}) =>
    request<Paginated<PayrollPeriodDto>>(`/hr/payroll-periods?${toQuery(params)}`),
  createPayrollPeriod: (body: Record<string, unknown>) =>
    request<PayrollPeriodDto>('/hr/payroll-periods', { method: 'POST', body }),
  payrollRuns: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<PayrollRunDto>>(`/hr/payroll-runs?${toQuery(params)}`),
  payrollRun: (id: string) => request<PayrollRunDto>(`/hr/payroll-runs/${id}`),
  createPayrollRun: (body: Record<string, unknown>) => request<PayrollRunDto>('/hr/payroll-runs', { method: 'POST', body }),
  approvePayrollRun: (id: string) => request<Record<string, unknown>>(`/hr/payroll-runs/${id}/approve`, { method: 'POST', body: {} }),
  lockPayrollRun: (id: string) => request<Record<string, unknown>>(`/hr/payroll-runs/${id}/lock`, { method: 'POST', body: {} }),
  payslips: (runId: string) => request<Paginated<Record<string, unknown>>>(`/hr/payroll-runs/${runId}/payslips`),
  hrAdvances: (params: { companyId?: string } = {}) =>
    request<Paginated<EmployeeAdvanceDto>>(`/hr/advances?${toQuery(params)}`),
  createAdvance: (body: Record<string, unknown>) => request<EmployeeAdvanceDto>('/hr/advances', { method: 'POST', body }),
  settleAdvance: (id: string, amountMinor: number, note?: string) =>
    request<EmployeeAdvanceDto>(`/hr/advances/${id}/settle`, { method: 'POST', body: { amountMinor, note } }),
  hrDashboard: (companyId?: string) =>
    request<HrDashboardDto>(`/hr/dashboard${companyId ? `?companyId=${companyId}` : ''}`),

  // ------------------------------------------------------------ CRM (E03)
  crmLeadSources: (params: { companyId?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/crm/lead-sources?${toQuery(params)}`),
  createLeadSource: (body: Record<string, unknown>) => request<Record<string, unknown>>('/crm/lead-sources', { method: 'POST', body }),
  crmLeads: (params: { companyId?: string; search?: string; status?: string; page?: number } = {}) =>
    request<Paginated<LeadDto>>(`/crm/leads?${toQuery(params)}`),
  createLead: (body: Record<string, unknown>) => request<LeadDto>('/crm/leads', { method: 'POST', body }),
  updateLead: (id: string, body: Record<string, unknown>) => request<LeadDto>(`/crm/leads/${id}`, { method: 'PATCH', body }),
  crmPipelines: (params: { companyId?: string } = {}) =>
    request<Paginated<PipelineDto>>(`/crm/pipelines?${toQuery(params)}`),
  createPipeline: (body: Record<string, unknown>) => request<PipelineDto>('/crm/pipelines', { method: 'POST', body }),
  crmOpportunities: (params: { companyId?: string; status?: string; page?: number } = {}) =>
    request<Paginated<OpportunityDto>>(`/crm/opportunities?${toQuery(params)}`),
  createOpportunity: (body: Record<string, unknown>) => request<OpportunityDto>('/crm/opportunities', { method: 'POST', body }),
  moveOpportunityStage: (id: string, stageId: string, note?: string) =>
    request<OpportunityDto>(`/crm/opportunities/${id}/stage`, { method: 'POST', body: { stageId, note } }),
  convertOpportunity: (id: string, body: Record<string, unknown> = {}) =>
    request<{ id: string; quoteNumber: string; totalMinor: number }>(`/crm/opportunities/${id}/convert`, { method: 'POST', body }),
  createCrmCustomer: (body: Record<string, unknown>) => request<Record<string, unknown>>('/crm/customers', { method: 'POST', body }),
  crmTickets: (params: { companyId?: string; status?: string; search?: string; page?: number } = {}) =>
    request<Paginated<SupportTicketDto>>(`/crm/tickets?${toQuery(params)}`),
  crmTicket: (id: string) => request<Record<string, unknown>>(`/crm/tickets/${id}`),
  createTicket: (body: Record<string, unknown>) => request<SupportTicketDto>('/crm/tickets', { method: 'POST', body }),
  addTicketMessage: (id: string, body: string, isInternal = false) =>
    request<Record<string, unknown>>(`/crm/tickets/${id}/messages`, { method: 'POST', body: { body, isInternal } }),
  updateTicket: (id: string, body: Record<string, unknown>) => request<SupportTicketDto>(`/crm/tickets/${id}`, { method: 'PATCH', body }),
  crmActivities: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<CrmActivityDto>>(`/crm/activities?${toQuery(params)}`),
  createActivity: (body: Record<string, unknown>) => request<CrmActivityDto>('/crm/activities', { method: 'POST', body }),
  completeActivity: (id: string) => request<CrmActivityDto>(`/crm/activities/${id}/complete`, { method: 'POST', body: {} }),
  crmSlaPolicies: (params: { companyId?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/crm/sla-policies?${toQuery(params)}`),
  setSlaPolicy: (body: Record<string, unknown>) => request<Record<string, unknown>>('/crm/sla-policies', { method: 'POST', body }),
  crmSegments: (params: { companyId?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/crm/segments?${toQuery(params)}`),
  createSegment: (body: Record<string, unknown>) => request<Record<string, unknown>>('/crm/segments', { method: 'POST', body }),
  crmDashboard: (companyId?: string) => request<CrmDashboardDto>(`/crm/dashboard${companyId ? `?companyId=${companyId}` : ''}`),

  // ----------------------------------------------------- Operations (E03)
  operationsProjects: (params: { companyId?: string; status?: string; page?: number } = {}) =>
    request<Paginated<ProjectDto>>(`/operations/projects?${toQuery(params)}`),
  createOperationsProject: (body: Record<string, unknown>) => request<ProjectDto>('/operations/projects', { method: 'POST', body }),
  updateOperationsProject: (id: string, body: Record<string, unknown>) =>
    request<ProjectDto>(`/operations/projects/${id}`, { method: 'PATCH', body }),
  operationsTasks: (params: { companyId?: string; status?: string; page?: number } = {}) =>
    request<Paginated<ProjectTaskDto>>(`/operations/tasks?${toQuery(params)}`),
  createOperationsTask: (body: Record<string, unknown>) => request<ProjectTaskDto>('/operations/tasks', { method: 'POST', body }),
  updateOperationsTask: (id: string, body: Record<string, unknown>) =>
    request<ProjectTaskDto>(`/operations/tasks/${id}`, { method: 'PATCH', body }),
  workOrders: (params: { companyId?: string; status?: string; page?: number } = {}) =>
    request<Paginated<WorkOrderDto>>(`/operations/work-orders?${toQuery(params)}`),
  workOrder: (id: string) => request<WorkOrderDto>(`/operations/work-orders/${id}`),
  createWorkOrder: (body: Record<string, unknown>) => request<WorkOrderDto>('/operations/work-orders', { method: 'POST', body }),
  assignWorkOrder: (id: string, body: Record<string, unknown>) =>
    request<WorkOrderDto>(`/operations/work-orders/${id}/assign`, { method: 'POST', body }),
  updateWorkOrder: (id: string, body: Record<string, unknown>) =>
    request<WorkOrderDto>(`/operations/work-orders/${id}`, { method: 'PATCH', body }),
  toggleWorkOrderChecklist: (id: string, isDone: boolean) =>
    request<WorkOrderChecklistItemDto>(`/operations/checklist-items/${id}`, { method: 'PATCH', body: { isDone } }),
  operationsApprovals: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/operations/approvals?${toQuery(params)}`),
  createApproval: (body: Record<string, unknown>) => request<Record<string, unknown>>('/operations/approvals', { method: 'POST', body }),
  decideApproval: (id: string, decision: string, note?: string) =>
    request<Record<string, unknown>>(`/operations/approvals/${id}/decide`, { method: 'POST', body: { decision, note } }),
  operationsCalendar: (params: { companyId?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/operations/calendar?${toQuery(params)}`),
  createCalendarEvent: (body: Record<string, unknown>) => request<Record<string, unknown>>('/operations/calendar', { method: 'POST', body }),
  operationsNotifications: (unreadOnly = false) =>
    request<Paginated<Record<string, unknown>>>(`/operations/notifications?unreadOnly=${unreadOnly}`),
  markNotificationsRead: () => request<{ updated: number }>('/operations/notifications/read', { method: 'POST', body: { all: true } }),
  operationsDashboard: (companyId?: string) =>
    request<OperationsDashboardDto>(`/operations/dashboard${companyId ? `?companyId=${companyId}` : ''}`),

  // ----------------------------------------------------- Automotive (E03)
  vehicles: (params: { companyId?: string; search?: string; status?: string; customerId?: string; page?: number } = {}) =>
    request<Paginated<VehicleDto>>(`/automotive/vehicles?${toQuery(params)}`),
  vehicle: (id: string) => request<Record<string, unknown>>(`/automotive/vehicles/${id}`),
  createVehicle: (body: Record<string, unknown>) => request<VehicleDto>('/automotive/vehicles', { method: 'POST', body }),
  updateVehicle: (id: string, body: Record<string, unknown>) => request<VehicleDto>(`/automotive/vehicles/${id}`, { method: 'PATCH', body }),
  recordMileage: (id: string, mileage: number) =>
    request<Record<string, unknown>>(`/automotive/vehicles/${id}/mileage`, { method: 'POST', body: { mileage } }),
  inspectionServices: (params: { companyId?: string } = {}) =>
    request<Paginated<InspectionServiceDto>>(`/automotive/inspection-services?${toQuery(params)}`),
  createInspectionService: (body: Record<string, unknown>) =>
    request<InspectionServiceDto>('/automotive/inspection-services', { method: 'POST', body }),
  inspectionBookings: (params: { companyId?: string; status?: string; page?: number } = {}) =>
    request<Paginated<InspectionBookingDto>>(`/automotive/inspection-bookings?${toQuery(params)}`),
  createInspectionBooking: (body: Record<string, unknown>) =>
    request<InspectionBookingDto>('/automotive/inspection-bookings', { method: 'POST', body }),
  updateInspectionBooking: (id: string, body: Record<string, unknown>) =>
    request<InspectionBookingDto>(`/automotive/inspection-bookings/${id}`, { method: 'PATCH', body }),
  recordInspectionFindings: (id: string, findings: Array<Record<string, unknown>>) =>
    request<Record<string, unknown>>(`/automotive/inspection-bookings/${id}/findings`, { method: 'POST', body: { findings } }),
  inspectionReport: (id: string) => request<Record<string, unknown>>(`/automotive/inspection-bookings/${id}/report`),
  submitInspectionReport: (id: string, body: Record<string, unknown> = {}) =>
    request<Record<string, unknown>>(`/automotive/inspection-bookings/${id}/report/submit`, { method: 'POST', body }),
  decideInspectionReport: (id: string, decision: string) =>
    request<Record<string, unknown>>(`/automotive/inspection-bookings/${id}/report/decide`, { method: 'POST', body: { decision } }),
  invoiceInspection: (id: string, body: Record<string, unknown> = {}) =>
    request<{ invoiceNumber: string; totalMinor: number }>(`/automotive/inspection-bookings/${id}/invoice`, { method: 'POST', body }),
  workshopBays: (params: { companyId?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/automotive/bays?${toQuery(params)}`),
  createWorkshopBay: (body: Record<string, unknown>) => request<Record<string, unknown>>('/automotive/bays', { method: 'POST', body }),
  maintenanceBookings: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/automotive/maintenance-bookings?${toQuery(params)}`),
  createMaintenanceBooking: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/automotive/maintenance-bookings', { method: 'POST', body }),
  jobCards: (params: { companyId?: string; status?: string; page?: number } = {}) =>
    request<Paginated<JobCardDto>>(`/automotive/job-cards?${toQuery(params)}`),
  jobCard: (id: string) => request<Record<string, unknown>>(`/automotive/job-cards/${id}`),
  createJobCard: (body: Record<string, unknown>) => request<JobCardDto>('/automotive/job-cards', { method: 'POST', body }),
  updateJobCard: (id: string, body: Record<string, unknown>) => request<JobCardDto>(`/automotive/job-cards/${id}`, { method: 'PATCH', body }),
  addLabour: (id: string, operations: Array<Record<string, unknown>>) =>
    request<Record<string, unknown>>(`/automotive/job-cards/${id}/labour`, { method: 'POST', body: { operations } }),
  createEstimate: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/automotive/job-cards/${id}/estimates`, { method: 'POST', body }),
  approveEstimate: (id: string) => request<Record<string, unknown>>(`/automotive/estimates/${id}/approve`, { method: 'POST', body: {} }),
  rejectEstimate: (id: string) => request<Record<string, unknown>>(`/automotive/estimates/${id}/reject`, { method: 'POST', body: {} }),
  invoiceJobCard: (id: string, body: Record<string, unknown> = {}) =>
    request<{ invoiceNumber: string; totalMinor: number }>(`/automotive/job-cards/${id}/invoice`, { method: 'POST', body }),
  partReservations: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<PartsReservationDto>>(`/automotive/reservations?${toQuery(params)}`),
  createPartReservation: (body: Record<string, unknown>) =>
    request<PartsReservationDto>('/automotive/reservations', { method: 'POST', body }),
  issuePartReservation: (id: string, body: Record<string, unknown> = {}) =>
    request<PartsReservationDto>(`/automotive/reservations/${id}/issue`, { method: 'POST', body }),
  warranties: (params: { companyId?: string; vehicleId?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/automotive/warranties?${toQuery(params)}`),
  createWarranty: (body: Record<string, unknown>) => request<Record<string, unknown>>('/automotive/warranties', { method: 'POST', body }),
  partReferences: (params: { companyId?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/automotive/part-references?${toQuery(params)}`),
  createPartReference: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/automotive/part-references', { method: 'POST', body }),
  partCompatibility: (params: { companyId?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/automotive/compatibility?${toQuery(params)}`),
  createPartCompatibility: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/automotive/compatibility', { method: 'POST', body }),
  compatibleParts: (make: string, model: string, year: number, companyId?: string) =>
    request<Paginated<Record<string, unknown>>>(
      `/automotive/compatible-parts?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${year}${companyId ? `&companyId=${companyId}` : ''}`,
    ),
  marketplaceProviders: (params: { status?: string } = {}) =>
    request<Paginated<MarketplaceProviderDto>>(`/automotive/providers?${toQuery(params)}`),
  createProvider: (body: Record<string, unknown>) =>
    request<MarketplaceProviderDto>('/automotive/providers', { method: 'POST', body }),
  decideProvider: (id: string, decision: 'APPROVED' | 'SUSPENDED' | 'REJECTED', note?: string) =>
    request<MarketplaceProviderDto>(`/automotive/providers/${id}/decide`, { method: 'POST', body: { decision, note } }),
  providerListings: (providerId: string) =>
    request<Paginated<Record<string, unknown>>>(`/automotive/providers/${providerId}/listings`),
  createProviderListing: (providerId: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/automotive/providers/${providerId}/listings`, { method: 'POST', body }),
  serviceRequests: (params: { companyId?: string; status?: string } = {}) =>
    request<Paginated<ServiceRequestDto>>(`/automotive/service-requests?${toQuery(params)}`),
  createServiceRequest: (body: Record<string, unknown>) =>
    request<ServiceRequestDto>('/automotive/service-requests', { method: 'POST', body }),
  assignServiceRequest: (id: string, providerId: string) =>
    request<ServiceRequestDto>(`/automotive/service-requests/${id}/assign`, { method: 'POST', body: { providerId } }),
  settlements: (params: { status?: string } = {}) =>
    request<Paginated<ProviderSettlementDto>>(`/automotive/settlements?${toQuery(params)}`),
  createSettlement: (body: Record<string, unknown>) =>
    request<ProviderSettlementDto>('/automotive/settlements', { method: 'POST', body }),
  automotiveDashboard: (companyId?: string) =>
    request<Record<string, number>>(`/automotive/dashboard${companyId ? `?companyId=${companyId}` : ''}`),

  // ------------------------------------------------- Execution 04: customer platform
  customerPlatformSummary: () => request<Record<string, number>>('/customer-platform/summary'),
  customerAccounts: (params: { search?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/customer-platform/accounts?${toQuery(params)}`),
  customerAccount: (id: string) => request<Record<string, unknown>>(`/customer-platform/accounts/${id}`),
  linkCustomerAccount: (id: string, customerId: string) =>
    request<Record<string, unknown>>(`/customer-platform/accounts/${id}/link`, { method: 'POST', body: { customerId } }),
  setCustomerAccountStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) =>
    request<Record<string, unknown>>(`/customer-platform/accounts/${id}/status`, { method: 'POST', body: { status, reason } }),

  // ------------------------------------------------- Execution 04: booking engine
  bookingAvailability: (params: { date: string; resourceId?: string; serviceRef?: string; durationMinutes?: number }) =>
    request<{ slots: Array<{ startsAt: string; endsAt: string; resourceId: string; resourceName?: string }> }>(
      `/bookings/availability?${toQuery(params)}`,
    ),
  bookings: (params: { status?: string; bookingType?: string; page?: number; pageSize?: number } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/bookings?${toQuery(params)}`),
  bookingCalendar: (from: string, to: string, resourceId?: string) =>
    request<Array<{ date: string; items: Array<Record<string, unknown>> }>>(
      `/bookings/calendar?from=${from}&to=${to}${resourceId ? `&resourceId=${resourceId}` : ''}`,
    ),
  booking: (id: string) => request<Record<string, unknown>>(`/bookings/${id}`),
  createBooking: (body: Record<string, unknown>) => request<Record<string, unknown>>('/bookings', { method: 'POST', body }),
  confirmBooking: (id: string) => request<Record<string, unknown>>(`/bookings/${id}/confirm`, { method: 'POST', body: {} }),
  startBooking: (id: string) => request<Record<string, unknown>>(`/bookings/${id}/start`, { method: 'POST', body: {} }),
  completeBooking: (id: string) => request<Record<string, unknown>>(`/bookings/${id}/complete`, { method: 'POST', body: {} }),
  markBookingNoShow: (id: string) => request<Record<string, unknown>>(`/bookings/${id}/no-show`, { method: 'POST', body: {} }),
  rescheduleBooking: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/bookings/${id}/reschedule`, { method: 'POST', body }),
  cancelBooking: (id: string, reason: string) =>
    request<Record<string, unknown>>(`/bookings/${id}/cancel`, { method: 'POST', body: { reason } }),
  bookingResources: (branchId?: string) =>
    request<Array<Record<string, unknown>>>(`/bookings/resources/list${branchId ? `?branchId=${branchId}` : ''}`),
  createBookingResource: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/bookings/resources', { method: 'POST', body }),
  setBookingResourceHours: (id: string, hours: Array<Record<string, unknown>>) =>
    request<Record<string, unknown>>(`/bookings/resources/${id}/hours`, { method: 'POST', body: { hours } }),

  // ------------------------------------------------- Execution 04: payments
  paymentProviders: () => request<Array<Record<string, unknown>>>('/payments/providers'),
  paymentIntents: (params: { targetType?: string; status?: string } = {}) =>
    request<Paginated<Record<string, unknown>>>(`/payments/intents?${toQuery(params)}`),
  createPaymentIntent: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/payments/intents', { method: 'POST', body }),
  paymentIntent: (id: string) => request<Record<string, unknown>>(`/payments/intents/${id}`),
  confirmPaymentIntent: (id: string, providerReference: string) =>
    request<Record<string, unknown>>(`/payments/intents/${id}/confirm`, { method: 'POST', body: { providerReference } }),
  cancelPaymentIntent: (id: string, reason: string) =>
    request<Record<string, unknown>>(`/payments/intents/${id}/cancel`, { method: 'POST', body: { reason } }),
  requestRefund: (intentId: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/payments/intents/${intentId}/refunds`, { method: 'POST', body }),
  approveRefund: (refundId: string) =>
    request<Record<string, unknown>>(`/payments/refunds/${refundId}/approve`, { method: 'POST', body: {} }),
  reconcilePayments: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/payments/reconciliations', { method: 'POST', body }),
  paymentReconciliations: (onlyUnmatched = false) =>
    request<Array<Record<string, unknown>>>(`/payments/reconciliations?onlyUnmatched=${onlyUnmatched}`),

  // ------------------------------------------------------- integrations center
  integrations: () => request<IntegrationCenterResponse>('/integrations'),
  integration: (key: string) => request<IntegrationDetailResponse>(`/integrations/${key}`),
  saveIntegrationCredentials: (key: string, credentials: Array<{ key: string; value: string }>) =>
    request<IntegrationDetailResponse>(`/integrations/${key}/credentials`, {
      method: 'PUT',
      body: { credentials },
    }),
  setIntegrationEnabled: (key: string, enabled: boolean, reason?: string) =>
    request<IntegrationDetailResponse>(`/integrations/${key}/enabled`, {
      method: 'PUT',
      body: { enabled, reason },
    }),
  verifyIntegration: (key: string) =>
    request<IntegrationDetailResponse>(`/integrations/${key}/verify`, { method: 'POST', body: {} }),
};

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    q.set(key, String(value));
  }
  return q.toString();
}
