/**
 * ORYX ERP mobile API client (staff plane).
 *
 * The control plane relies on an HttpOnly refresh cookie; a native client has no
 * cookie jar. The staff API therefore returns the refresh token in the response
 * body **only** when the request carries `x-oryx-client: mobile` (see
 * `AuthController.completeLogin`), and this client is the only place that asks
 * for it. The token is written through `session-storage.ts` — the platform
 * keychain on a device, `localStorage` in a browser — never to `AsyncStorage`,
 * never to a plain file and never logged.
 *
 * Two headers carry the tenant scope the server enforces: `x-oryx-company-id`
 * and `x-oryx-branch-id`. They select *within* the caller's own memberships; the
 * API still rejects any company or branch the user is not entitled to, so a
 * forged header cannot widen access.
 *
 * Every request is scoped to `/api/v1` and the staff plane.
 */

import Constants from 'expo-constants';

import { deleteSecret, getSecret, readCsrfToken, setSecret } from './session-storage';

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://localhost:3001/api';

/** Marks the request as a native client so the API returns a body refresh token. */
const CLIENT_HEADER = 'x-oryx-client';
const CLIENT_KIND = 'mobile';

/** Tenant scope headers, read by the API's context guard. */
const COMPANY_HEADER = 'x-oryx-company-id';
const BRANCH_HEADER = 'x-oryx-branch-id';

/** Keychain entry holding the rotating refresh token. */
const REFRESH_KEY = 'oryx.erp.refreshToken';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ErpUser {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string;
  status: string;
  isSuperAdmin: boolean;
  preferredLocale: 'ar' | 'en';
  preferredTheme: 'dark' | 'light';
}

export interface ErpMembership {
  companyId: string;
  companyNameEn: string;
  companyNameAr: string;
  companyType: string;
  companyStatus: string;
  roleId: string;
  roleNameEn: string;
  roleNameAr: string;
  branchIds: string[];
}

export interface ErpSession {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: ErpUser;
  memberships: ErpMembership[];
  permissions: string[];
}

export interface ErpMe {
  user: ErpUser;
  memberships: ErpMembership[];
  permissions: string[];
  mfa: { enabled: boolean; enrolledAt: string | null; recoveryCodesRemaining: number };
  context: {
    companyId: string | null;
    branchId: string | null;
    licensedModules: string[];
    supportSessionCompanyId: string | null;
  };
}

export interface ErpBranch {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  isActive: boolean;
}

export interface ErpSessionRow {
  id: string;
  deviceKind: string;
  deviceName: string | null;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

// ------------------------------------------------------------- session state

type Listener = () => void;

let accessToken: string | null = null;
let cachedRefreshToken: string | null = null;
let companyId: string | null = null;
let branchId: string | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export const session = {
  get access(): string | null {
    return accessToken;
  },
  get authenticated(): boolean {
    return accessToken !== null;
  },
  get companyId(): string | null {
    return companyId;
  },
  get branchId(): string | null {
    return branchId;
  },
  /**
   * Select the company (and optionally the branch) every later request is scoped
   * to. Held in memory only: a restart re-derives it from `/auth/me`, so a stale
   * scope can never outlive the session it belonged to.
   */
  setScope(nextCompanyId: string | null, nextBranchId: string | null) {
    companyId = nextCompanyId;
    branchId = nextBranchId;
    notify();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * Persist the refresh token in the platform keychain.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` keeps the token out of iCloud Keychain
 * backups and Android auto-backup, so a restored device does not silently
 * inherit a staff session. The browser fallback lives in `session-storage.ts`.
 */
async function storeRefreshToken(token: string): Promise<void> {
  cachedRefreshToken = token;
  await setSecret(REFRESH_KEY, token);
}

async function readRefreshToken(): Promise<string | null> {
  if (cachedRefreshToken) return cachedRefreshToken;
  cachedRefreshToken = await getSecret(REFRESH_KEY);
  return cachedRefreshToken;
}

async function clearSession(): Promise<void> {
  accessToken = null;
  cachedRefreshToken = null;
  companyId = null;
  branchId = null;
  await deleteSecret(REFRESH_KEY);
  notify();
}

interface SessionResponse {
  accessToken?: string;
  refreshToken?: string;
  memberships?: ErpMembership[];
  user?: ErpUser;
  permissions?: string[];
}

function adoptSession(payload: SessionResponse): void {
  if (payload.accessToken) {
    accessToken = payload.accessToken;
    notify();
  }
}

// --------------------------------------------------------------- request core

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  anonymous?: boolean;
  noRetry?: boolean;
  /** Send the request without the tenant scope headers. */
  noScope?: boolean;
}

/**
 * Single-flight refresh with a three-state outcome.
 *
 * `unavailable` (offline, timeout, 5xx) is deliberately distinct from `expired`
 * (the API rejected the token). Collapsing the two signed a user out on a
 * transient failure, which is the defect the control plane already fixed.
 */
type RefreshOutcome = 'ok' | 'expired' | 'unavailable';

let refreshInFlight: Promise<RefreshOutcome> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rotate the session; concurrent 401s share one rotation. */
async function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<RefreshOutcome> => {
      try {
        const refreshToken = await readRefreshToken();
        if (!refreshToken) return 'expired';
        const csrf = readCsrfToken();
        const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [CLIENT_HEADER]: CLIENT_KIND,
            ...(csrf ? { 'x-oryx-csrf': csrf } : {}),
          },
          body: JSON.stringify({ refreshToken }),
        });
        if (res.ok) {
          const data = (await res.json()) as SessionResponse;
          if (data.refreshToken) await storeRefreshToken(data.refreshToken);
          adoptSession(data);
          return 'ok';
        }
        if (res.status === 401 || res.status === 403) {
          await clearSession();
          return 'expired';
        }
        return 'unavailable';
      } catch {
        return 'unavailable';
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

const RESTORE_ATTEMPTS = 3;
const RESTORE_BACKOFF_MS = 600;

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { [CLIENT_HEADER]: CLIENT_KIND };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous) {
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (!options.noScope) {
      if (companyId) headers[COMPANY_HEADER] = companyId;
      if (branchId) headers[BRANCH_HEADER] = branchId;
    }
  }
  // No-op on a device; in a browser this mirrors the control plane's
  // double-submit so the web export works against the API origin.
  const csrf = readCsrfToken();
  if (csrf) headers['x-oryx-csrf'] = csrf;

  const res = await fetch(`${API_BASE}/v1${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options.anonymous && !options.noRetry) {
    const outcome = await refreshSession();
    if (outcome === 'ok') return request<T>(path, { ...options, noRetry: true });
    if (outcome === 'expired') {
      await clearSession();
    } else {
      // Transient failure: keep the stored session and report an outage.
      throw new ApiError(503, 'network.unavailable', 'The service is temporarily unavailable.');
    }
  }

  if (!res.ok) {
    let body: { message?: string | string[]; code?: string; error?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* non-JSON error body */
    }
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message ?? body.error ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, body.code ?? 'unknown_error', message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    q.set(key, String(value));
  }
  return q.toString();
}

// ------------------------------------------------------------------- client

export const api = {
  /** Sign in, then persist the refresh token for the new session. */
  async login(email: string, password: string) {
    const data = await request<SessionResponse & { mfaRequired?: boolean; challengeToken?: string }>(
      '/auth/login',
      { method: 'POST', body: { email, password }, anonymous: true, noScope: true },
    );
    if (data.mfaRequired) return data;
    if (data.refreshToken) await storeRefreshToken(data.refreshToken);
    adoptSession(data);
    return data;
  },

  async verifyMfaLogin(challengeToken: string, code: string) {
    const data = await request<SessionResponse>('/auth/mfa/verify-login', {
      method: 'POST',
      body: { challengeToken, code },
      anonymous: true,
      noScope: true,
    });
    if (data.refreshToken) await storeRefreshToken(data.refreshToken);
    adoptSession(data);
    return data;
  },

  /**
   * Restore a session at start-up.
   *
   * A stored refresh token is exchanged for a new access token; nothing else is
   * trusted, so an expired or revoked token simply leaves the app signed out.
   * A transient failure is retried a bounded number of times first, so a flaky
   * network at launch does not sign the user out.
   */
  async restore(): Promise<RefreshOutcome> {
    if (accessToken) return 'ok';
    let outcome: RefreshOutcome = 'unavailable';
    for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt += 1) {
      outcome = await refreshSession();
      if (outcome !== 'unavailable') return outcome;
      if (attempt < RESTORE_ATTEMPTS - 1) await sleep(RESTORE_BACKOFF_MS * (attempt + 1));
    }
    return outcome;
  },

  async logout() {
    try {
      await request('/auth/logout', { method: 'POST', body: {}, noScope: true });
    } catch {
      // A failed revoke must not keep the user signed in on the device.
    }
    await clearSession();
  },

  me: () => request<ErpMe>('/auth/me', { noScope: true }),
  updateProfile: (body: { preferredLocale?: 'ar' | 'en'; preferredTheme?: 'dark' | 'light' }) =>
    request<ErpMe['user']>('/auth/profile', { method: 'POST', body, noScope: true }),

  // ------------------------------------------------------------- sessions
  sessions: () => request<{ sessions: ErpSessionRow[] }>('/auth/sessions', { noScope: true }),
  revokeSession: (sessionId: string) =>
    request<{ revoked: boolean }>(`/auth/sessions/${sessionId}`, { method: 'DELETE', noScope: true }),

  // ----------------------------------------------------------------- scope
  /** The company record, which carries the currency the tenant prices in. */
  company: (id: string) =>
    request<import('@oryx/shared').CompanyDto>(`/companies/${id}`, { noScope: true }),

  branches: (id: string) =>
    request<{ items: ErpBranch[]; total: number }>(
      `/companies/${id}/branches?pageSize=100`,
      { noScope: true },
    ),

  dashboard: () => request<import('@oryx/shared').DashboardResponse>('/dashboard'),

  /**
   * Operational reports.
   *
   * The `/dashboard` figures describe the platform (companies, users, MRR), which
   * is not what a branch operator needs. These endpoints return the real trading
   * numbers for the selected company and branch, and they are permission-aware
   * on the server.
   */
  reports: {
    sales: () => request<import('@oryx/shared').SalesReportDto>('/reports/sales'),
    inventory: () => request<import('@oryx/shared').InventoryReportDto>('/reports/inventory'),
    purchasing: () => request<import('@oryx/shared').PurchasingReportDto>('/reports/purchasing'),
    accounting: () => request<import('@oryx/shared').AccountingReportDto>('/reports/accounting'),
  },

  /** The `total` of a list endpoint, without transferring the rows. */
  async count(path: string, params: Record<string, unknown> = {}): Promise<number> {
    const qs = toQuery({ ...params, pageSize: 1 });
    const res = await request<{ total?: number }>(`${path}${qs ? `?${qs}` : ''}`);
    return res.total ?? 0;
  },

  // ------------------------------------------------------- generic records
  list: <T>(path: string, params: Record<string, unknown> = {}) => {
    const qs = toQuery(params);
    return request<{ items: T[]; total: number; page?: number; pageSize?: number }>(
      `${path}${qs ? `?${qs}` : ''}`,
    );
  },
  get: <T>(path: string) => request<T>(path),
  create: <T>(path: string, body: Record<string, unknown>) =>
    request<T>(path, { method: 'POST', body }),
  update: <T>(path: string, body: Record<string, unknown>) =>
    request<T>(path, { method: 'POST', body }),

  // ------------------------------------------------------- sales specifics
  createInvoice: (body: Record<string, unknown>) =>
    request<import('@oryx/shared').SalesDocumentDto>('/sales/invoices', { method: 'POST', body }),

  // --------------------------------------------------- inventory specifics
  createTransfer: (body: Record<string, unknown>) =>
    request<import('@oryx/shared').StockTransferDto>('/inventory/transfers', {
      method: 'POST',
      body,
    }),
  postTransfer: (id: string) =>
    request<import('@oryx/shared').StockTransferDto>(`/inventory/transfers/${id}/post`, {
      method: 'POST',
      body: {},
    }),
};

export type { RefreshOutcome };
