import type {
  AppVersionDto,
  LoginResult,
  AuditLogDto,
  BranchDto,
  CmsBannerDto,
  CmsPageDto,
  CompanyDto,
  ContextResponse,
  DashboardResponse,
  FeatureFlagDto,
  InvitationDto,
  LoginResponse,
  ModuleDto,
  Paginated,
  PlanDto,
  RoleDto,
  SubscriptionDto,
  UserDto,
} from '@oryx/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api';

const ACCESS_KEY = 'oryx.accessToken';
const COMPANY_KEY = 'oryx.companyId';
const BRANCH_KEY = 'oryx.branchId';
/**
 * CSRF cookie name set by the API. It is intentionally readable by JavaScript
 * so the double-submit pattern works; the refresh token itself lives in an
 * HttpOnly cookie and is never accessible here.
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
 * Client-side session store.
 *
 * Only the short-lived access token is kept in memory/localStorage. The refresh
 * token is held by the API in an HttpOnly cookie, so it is never exposed to
 * JavaScript and cannot be stolen by an XSS payload.
 */
export const tokenStore = {
  get access(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_KEY);
  },
  get companyId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(COMPANY_KEY);
  },
  get branchId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(BRANCH_KEY);
  },
  setAccessToken(access: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACCESS_KEY, access);
  },
  setContext(companyId: string | null, branchId: string | null) {
    if (typeof window === 'undefined') return;
    if (companyId) window.localStorage.setItem(COMPANY_KEY, companyId);
    else window.localStorage.removeItem(COMPANY_KEY);
    if (branchId) window.localStorage.setItem(BRANCH_KEY, branchId);
    else window.localStorage.removeItem(BRANCH_KEY);
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(COMPANY_KEY);
    window.localStorage.removeItem(BRANCH_KEY);
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

  // ----------------------------------------------------------------- support
  supportSessions: () => request<Array<Record<string, unknown>>>('/support-sessions'),
  openSupportSession: (body: { companyId: string; reason: string; minutes?: number }) =>
    request<Record<string, unknown>>('/support-sessions', { method: 'POST', body }),
  endSupportSession: (id: string) =>
    request<{ ok: boolean }>(`/support-sessions/${id}/end`, { method: 'POST' }),
};

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    q.set(key, String(value));
  }
  return q.toString();
}
