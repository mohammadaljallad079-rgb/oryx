/**
 * ORYX mobile API client.
 *
 * The website can rely on an HttpOnly refresh cookie; a native client cannot.
 * The API therefore exposes the refresh token in the response body **only** when
 * the request carries `x-oryx-client: mobile` (see `CustomerAuthController`), and
 * this client is the only place that asks for it. The token is written straight
 * to the platform keychain through `expo-secure-store` — never to
 * `AsyncStorage`, never to a plain file, and never logged.
 *
 * The short-lived access token is kept in memory only, so a process restart
 * re-acquires it by rotating the stored refresh token.
 *
 * Every request is scoped to `/api/v1` and the consumer plane; a staff route is
 * not reachable with a customer token.
 */

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://localhost:3001/api';

/** Marks the request as a native client so the API returns a body refresh token. */
const CLIENT_HEADER = 'x-oryx-client';
const CLIENT_KIND = 'mobile';

/** Keychain entry holding the rotating refresh token. */
const REFRESH_KEY = 'oryx.customer.refreshToken';

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

export interface CustomerProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  preferredLocale: 'ar' | 'en';
  preferredTheme: 'dark' | 'light';
  mfaEnabled: boolean;
  defaultCompanyId: string | null;
  _count?: { vehicles: number; addresses: number; bookings: number };
}

export interface Vehicle {
  id: string;
  vin: string;
  plateNumber: string | null;
  make: string;
  model: string;
  modelYear: number;
  color: string | null;
  mileage: number;
  status: string;
}

export interface BookingSlot {
  id: string;
  reference: string;
  bookingType: string;
  status: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  serviceRef: string | null;
  cancellationReason?: string | null;
}

export interface AvailableSlot {
  startsAt: string;
  endsAt: string;
  resourceId?: string | null;
}

export interface NotificationItem {
  id: string;
  title?: string | null;
  body: string;
  category: string;
  readAt?: string | null;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  intentNumber: string;
  targetType: string;
  amountMinor: number;
  currency: string;
  currencyScale: number;
  status: string;
  provider: string;
  description: string | null;
  succeededAt: string | null;
  createdAt: string;
  refunds: Array<{ id: string; refundNumber: string; amountMinor: number; status: string }>;
}

export interface ProviderSummary {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  categoryKey: string | null;
  city?: string | null;
  averageRating?: number | null;
  reviewCount?: number;
}

export interface ProviderDetail extends ProviderSummary {
  availability: Array<{ dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean }>;
  reviews: Array<{
    id: string;
    rating: number;
    title: string | null;
    comment: string | null;
    providerReply: string | null;
    createdAt: string;
  }>;
  listings: Array<{ id: string; nameEn: string; nameAr: string; priceMinor: number }>;
}

export interface ServiceRequestRecord {
  id: string;
  requestNumber: string;
  categoryKey: string;
  description: string | null;
  status: string;
  createdAt: string;
}

// ------------------------------------------------------------- session state

type Listener = () => void;

let accessToken: string | null = null;
let cachedRefreshToken: string | null = null;
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
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * Persist the refresh token in the platform keychain.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` keeps the token out of iCloud Keychain backups
 * and Android auto-backup, so a restored device does not silently inherit a
 * session.
 */
async function storeRefreshToken(token: string): Promise<void> {
  cachedRefreshToken = token;
  await SecureStore.setItemAsync(REFRESH_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function readRefreshToken(): Promise<string | null> {
  if (cachedRefreshToken) return cachedRefreshToken;
  cachedRefreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  return cachedRefreshToken;
}

async function clearSession(): Promise<void> {
  accessToken = null;
  cachedRefreshToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  notify();
}

interface SessionResponse {
  accessToken?: string;
  refreshToken?: string;
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
}

let refreshInFlight: Promise<boolean> | null = null;

/** Rotate the session; concurrent 401s share one rotation. */
async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const refreshToken = await readRefreshToken();
        if (!refreshToken) return false;
        const res = await fetch(`${API_BASE}/v1/customer/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [CLIENT_HEADER]: CLIENT_KIND },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          await clearSession();
          return false;
        }
        const data = (await res.json()) as SessionResponse;
        if (data.refreshToken) await storeRefreshToken(data.refreshToken);
        adoptSession(data);
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
  const headers: Record<string, string> = { [CLIENT_HEADER]: CLIENT_KIND };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}/v1${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options.anonymous && !options.noRetry) {
    if (await refreshSession()) return request<T>(path, { ...options, noRetry: true });
    await clearSession();
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

// ------------------------------------------------------------------- client

export const api = {
  /** Register, then persist the refresh token for the new session. */
  async register(body: { email: string; password: string; fullName: string; phone?: string }) {
    const data = await request<SessionResponse>('/customer/auth/register', {
      method: 'POST',
      body,
      anonymous: true,
    });
    if (data.refreshToken) await storeRefreshToken(data.refreshToken);
    adoptSession(data);
    return data;
  },

  async login(email: string, password: string) {
    const data = await request<SessionResponse & { mfaRequired?: boolean; challengeToken?: string }>(
      '/customer/auth/login',
      { method: 'POST', body: { email, password }, anonymous: true },
    );
    if (data.mfaRequired) return data;
    if (data.refreshToken) await storeRefreshToken(data.refreshToken);
    adoptSession(data);
    return data;
  },

  async verifyMfaLogin(challengeToken: string, code: string) {
    const data = await request<SessionResponse>('/customer/auth/mfa/verify-login', {
      method: 'POST',
      body: { challengeToken, code },
      anonymous: true,
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
   */
  async restore(): Promise<boolean> {
    if (accessToken) return true;
    return refreshSession();
  },

  async logout() {
    try {
      await request('/customer/auth/logout', { method: 'POST', body: {} });
    } catch {
      // A failed revoke must not keep the user signed in on the device.
    }
    await clearSession();
  },

  me: () => request<CustomerProfile>('/customer/auth/me'),
  updateProfile: (body: {
    fullName?: string;
    phone?: string;
    preferredLocale?: 'ar' | 'en';
    preferredTheme?: 'dark' | 'light';
  }) => request<CustomerProfile>('/customer/auth/profile', { method: 'POST', body }),

  forgotPassword: (email: string) =>
    request<{ accepted: boolean }>('/customer/auth/forgot-password', {
      method: 'POST',
      body: { email },
      anonymous: true,
    }),

  // --------------------------------------------------------------- garage
  vehicles: () => request<Vehicle[]>('/customer/vehicles'),
  addVehicle: (body: {
    vin: string;
    make: string;
    model: string;
    modelYear: number;
    plateNumber?: string;
    color?: string;
    mileage?: number;
  }) => request<Vehicle>('/customer/vehicles', { method: 'POST', body }),
  vehicle: (id: string) => request<Vehicle>(`/customer/vehicles/${id}`),
  vehicleHistory: (id: string) =>
    request<{ items: Array<Record<string, unknown>> }>(`/customer/vehicles/${id}/history`),
  removeVehicle: (id: string) => request<void>(`/customer/vehicles/${id}`, { method: 'DELETE' }),

  // -------------------------------------------------------------- bookings
  availability: (params: { date: string; durationMinutes: number; serviceRef?: string }) => {
    const qs = new URLSearchParams({
      date: params.date,
      durationMinutes: String(params.durationMinutes),
    });
    if (params.serviceRef) qs.set('serviceRef', params.serviceRef);
    return request<AvailableSlot[]>(`/customer/bookings/availability?${qs.toString()}`);
  },
  createBooking: (body: {
    bookingType: 'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE';
    startsAt: string;
    durationMinutes: number;
    vehicleId?: string;
    serviceRef?: string;
    notes?: string;
  }) => request<BookingSlot>('/customer/bookings', { method: 'POST', body }),
  bookings: () => request<{ items: BookingSlot[]; total: number }>('/customer/bookings?pageSize=50'),
  cancelBooking: (id: string, reason: string) =>
    request<BookingSlot>(`/customer/bookings/${id}/cancel`, { method: 'POST', body: { reason } }),

  // -------------------------------------------------------------- payments
  payments: () => request<{ items: PaymentRecord[]; total: number }>('/customer/payments?pageSize=50'),

  // --------------------------------------------------------- notifications
  notifications: () =>
    request<{ items: NotificationItem[]; total: number }>('/customer/notifications?pageSize=50'),
  markAllNotificationsRead: () =>
    request<{ updated: number }>('/customer/notifications/read-all', { method: 'POST', body: {} }),

  // ----------------------------------------------------------- marketplace
  serviceRequests: () =>
    request<{ items: ServiceRequestRecord[]; total: number }>(
      '/customer/marketplace/requests?pageSize=50',
    ),
  createServiceRequest: (body: { categoryKey: string; description?: string; vehicleId?: string }) =>
    request<ServiceRequestRecord>('/customer/marketplace/requests', { method: 'POST', body }),

  // ---------------------------------------------------------------- public
  providers: (categoryKey?: string) =>
    request<{ items: ProviderSummary[]; total: number }>(
      `/marketplace/providers?pageSize=50${categoryKey ? `&categoryKey=${encodeURIComponent(categoryKey)}` : ''}`,
      { anonymous: true },
    ),
  provider: (id: string) =>
    request<ProviderDetail>(`/marketplace/providers/${id}`, { anonymous: true }),
};

/** Service categories offered by the platform. */
export const SERVICE_CATEGORIES = [
  { key: 'automotive_maintenance', nameEn: 'Maintenance and repair', nameAr: 'الصيانة والإصلاح' },
  { key: 'automotive_inspection', nameEn: 'Vehicle inspection', nameAr: 'فحص المركبات' },
  { key: 'automotive_tyres', nameEn: 'Tyres and batteries', nameAr: 'الإطارات والبطاريات' },
  { key: 'automotive_bodywork', nameEn: 'Bodywork and paint', nameAr: 'الهيكل والدهان' },
  { key: 'automotive_recovery', nameEn: 'Roadside recovery', nameAr: 'خدمات الطريق' },
] as const;
