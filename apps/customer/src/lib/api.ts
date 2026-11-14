/**
 * Customer website API client.
 *
 * Session discipline mirrors the control plane and is deliberately not
 * relaxed for the consumer surface:
 *   - the refresh token lives in an HttpOnly cookie scoped to
 *     `/api/v1/customer` and is never readable by JavaScript;
 *   - the access token is held in a module-scoped variable only, so a reload
 *     re-acquires it from the cookie and no token is persisted anywhere an XSS
 *     payload could read it in a later session;
 *   - state-changing requests echo the readable `oryx_ccsrf` cookie in
 *     the `x-oryx-csrf` header (double-submit), which the API validates.
 *
 * Every route here is under `/api/v1` and is either public or consumer-plane;
 * no staff route is reachable with a consumer token.
 */

import { SERVICE_CATEGORIES as SHARED_SERVICE_CATEGORIES, categoryArt } from '@oryx/shared';
import { assetUrl } from './asset-url';
import { sitePhotoForCategory } from './site-media';
import {
  IS_STATIC_PREVIEW,
  PREVIEW_ADDRESSES,
  PREVIEW_BOOKINGS,
  PREVIEW_NOTIFICATION_PREFERENCES,
  PREVIEW_NOTIFICATIONS,
  PREVIEW_PAYMENTS,
  PREVIEW_PRIVACY,
  PREVIEW_PROFILE,
  PREVIEW_READ_ONLY_MESSAGE,
  PREVIEW_SERVICE_REQUESTS,
  PREVIEW_VEHICLES,
  previewProvider,
  previewProviders,
  previewProductDetail,
  previewProducts,
  previewStores,
  previewWebsiteContent,
} from './preview-data';

/** Re-exported so callers have one import for API access and asset paths. */
export { assetUrl, ASSET_PREFIX } from './asset-url';

/** Re-exported so a page can branch on the preview without a second import. */
export { IS_STATIC_PREVIEW } from './preview-data';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api';

/**
 * Name of the readable CSRF cookie the API sets alongside the HttpOnly consumer
 * refresh cookie. It must match `CUSTOMER_CSRF_COOKIE` in the API.
 */
const CSRF_COOKIE = 'oryx_ccsrf';
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

let accessToken: string | null = null;
let sessionHinted = false;

const sessionLossListeners = new Set<() => void>();

export const customerSession = {
  get access(): string | null {
    return accessToken;
  },
  get hasHint(): boolean {
    return sessionHinted;
  },
  setAccessToken(token: string) {
    accessToken = token;
    sessionHinted = true;
  },
  markHint() {
    sessionHinted = true;
  },
  clear() {
    accessToken = null;
    sessionHinted = false;
  },
  onSessionLost(listener: () => void): () => void {
    sessionLossListeners.add(listener);
    return () => sessionLossListeners.delete(listener);
  },
  notifySessionLost() {
    accessToken = null;
    sessionHinted = false;
    for (const listener of sessionLossListeners) listener();
  },
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  anonymous?: boolean;
  noRetry?: boolean;
}

/**
 * Single-flight refresh with a three-state outcome.
 *
 * `unavailable` (offline, timeout, 5xx, 429) is deliberately distinct from
 * `expired` (the API rejected the token). Collapsing the two logged a user out
 * on a transient failure — the defect behind the iPad incident.
 */
type RefreshOutcome = 'ok' | 'expired' | 'unavailable';

let refreshInFlight: Promise<RefreshOutcome> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rotate the consumer session; concurrent 401s share one rotation. */
async function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<RefreshOutcome> => {
      try {
        const csrf = readCookie(CSRF_COOKIE);
        const res = await fetch(`${API_BASE}/v1/customer/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
          },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const data = (await res.json()) as { accessToken: string };
          customerSession.setAccessToken(data.accessToken);
          return 'ok';
        }
        if (res.status === 401 || res.status === 403) {
          customerSession.clear();
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

/**
 * Restore a session after a reload, using the HttpOnly refresh cookie.
 *
 * A transient failure is retried a bounded number of times before being
 * reported, so a flaky network at boot does not bounce the user to sign-in.
 */
export async function restoreCustomerSession(): Promise<RefreshOutcome> {
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
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;
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
    const outcome = await refreshSession();
    if (outcome === 'ok') return request<T>(path, { ...options, noRetry: true });
    if (outcome === 'expired') {
      customerSession.notifySessionLost();
    } else {
      // Transient failure: keep the session and report an outage instead.
      throw new ApiError(503, 'network.unavailable', 'The service is temporarily unavailable.');
    }
  }

  if (!res.ok) {
    let body: { message?: string | string[]; code?: string; error?: string } = {};
    try {
      body = await res.json();
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

/** Public read of a JSON endpoint, used by server components. */
async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/v1${path}`, { cache: 'no-store' });
  if (!res.ok) throw new ApiError(res.status, 'request_failed', `Request failed: ${path}`);
  return (await res.json()) as T;
}

// ------------------------------------------------------------------ shapes

/**
 * The projection a QR scan returns.
 *
 * Deliberately narrow: enough to confirm the document is genuine and identify
 * it, and nothing more. No amount, no line item and no contact detail is
 * present, so a screenshot of the verification page cannot leak a customer's
 * financial position.
 */
export interface DocumentVerificationView {
  status: 'VALID' | 'REVOKED' | 'SUPERSEDED' | 'CANCELLED';
  type: string;
  typeLabelEn: string;
  typeLabelAr: string;
  documentNumber: string;
  version: number;
  issuerNameEn: string;
  issuerNameAr: string;
  issuerCode: string;
  issuedAt: string;
  subject?: {
    jobNumber: string;
    plateNumber: string | null;
    vinMasked: string;
    make: string;
    model: string;
    modelYear: number;
  };
}

export interface DocumentVerificationResult {
  found: boolean;
  document: DocumentVerificationView | null;
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
  _count: { vehicles: number; addresses: number; bookings: number };
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

export interface Address {
  id: string;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  countryCode: string;
  isDefault: boolean;
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

/** One day's bookability, as `GET /customer/bookings/availability-days` returns it. */
export interface AvailableDay {
  date: string;
  slots: number;
  firstSlot: string | null;
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
  listings?: Array<{ id: string; nameEn: string; nameAr: string; priceMinor: number }>;
  /** Auto Map coordinates (P3), present once an operator places the provider. */
  latitude?: number | null;
  longitude?: number | null;
  /** Kilometres from the query origin; present only on a proximity search. */
  distanceKm?: number | null;
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

/** A catalogue category as `GET /customer/catalog/categories` returns it. */
export interface CatalogCategory {
  key: string;
  name: string;
  icon: string | null;
  domain: string | null;
  imageUrl: string | null;
}

/** The public product projection — never a cost price or a stock quantity. */
export interface CatalogProduct {
  id: string;
  storeId: string;
  sku: string;
  name: string;
  nameEn: string;
  nameAr: string;
  type: string;
  unit: string;
  priceMinor: number;
  taxRateBp: number;
  available: boolean;
  imageUrl: string | null;
  store: { id: string; code: string; name: string };
}

/** A store that has at least one published product. */
export interface CatalogStore {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  nameAr: string;
  countryCode: string;
  providerId: string | null;
  categoryKey: string | null;
  productCount: number;
}

/** A live promotional offer from an approved provider. */
export interface ProviderOffer {
  id: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  discountBp: number | null;
  priceMinor: number | null;
  categoryKey: string | null;
  startsAt: string | null;
  endsAt: string | null;
  provider: { id: string; code: string; nameEn: string; nameAr: string };
}

/** A line in the customer cart. */
export interface CartItem {
  id: string;
  productId: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  available: boolean;
}

export interface Cart {
  items: CartItem[];
  totalMinor: number;
  itemCount: number;
}

/** A placed order as the customer sees it. */
export interface CustomerOrder {
  id: string;
  reference: string;
  status: string;
  paymentMethod: string;
  subtotalMinor: number;
  taxMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  currency: string;
  placedAt: string;
  itemCount: number;
  lines: Array<{
    id: string;
    sku: string;
    nameEn: string;
    nameAr: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }>;
  /** Present on the detail projection only. */
  cancellable?: boolean;
  notes?: string | null;
  events?: Array<{ status: string; note: string | null; actor: string; createdAt: string }>;
}

export interface ServiceRequestRecord {
  id: string;
  requestNumber: string;
  categoryKey: string;
  description: string | null;
  status: string;
  createdAt: string;
}

export interface DisputeRecord {
  id: string;
  status: string;
  subject: string | null;
  createdAt: string;
  messages?: Array<{ id: string; body: string; authorKind: string; isInternal: boolean }>;
}

export interface NotificationPreference {
  channel: string;
  category: string;
  enabled: boolean;
}

export interface PrivacySettings {
  allowMarketingEmails: boolean;
  shareContactWithProvider: boolean;
  allowDataAnalytics?: boolean;
}

// ------------------------------------------------------------------- client

/**
 * Raised by any mutating call in the static preview.
 *
 * The preview must never imply that a booking was placed, a payment moved or a
 * session was created, so every write fails loudly instead of being faked.
 */
function previewReadOnly(): never {
  throw new ApiError(501, 'preview_read_only', PREVIEW_READ_ONLY_MESSAGE);
}

/**
 * A provider quote on a consumer RFQ (P4).
 *
 * Mirrors `RfqQuoteDto` in `@oryx/shared`; declared here so the website client
 * does not reach into the mobile contract for a field name.
 */
export interface RfqQuoteRecord {
  id: string;
  providerId: string;
  priceMinor: number;
  currency: string;
  leadTimeDays: number | null;
  note: string | null;
  status: string;
  createdAt: string;
}

/** A consumer request for quotation (P4). */
export interface RfqRecord {
  id: string;
  reference: string;
  categoryKey: string;
  description: string;
  quantity: number;
  status: string;
  acceptedQuoteId: string | null;
  expiresAt: string | null;
  createdAt: string;
  vehicle: { id: string; label: string } | null;
  quotes: RfqQuoteRecord[];
}

/** A consumer order return (P4). */
export interface CustomerReturnRecord {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string | null;
  reason: string;
  status: string;
  reviewNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  receivedAt: string | null;
  refundedAt: string | null;
  cancellable: boolean;
  lines: Array<{ id: string; orderLineId: string; productId: string; quantity: number }>;
}

/** The fitment answer for one vehicle and product (P4). */
export interface FitmentResult {
  vehicle: { id: string; label: string; year: number };
  product: { id: string; sku: string; nameEn: string; nameAr: string };
  compatible: boolean;
  notes: string[];
  fitmentKnown: boolean;
}

export const customerApi = {
  /**
   * Verifies a printed document from its QR token.
   *
   * Public and anonymous: the scan arrives with no session, and the token is the
   * only credential. The API answers `found: false` for an unknown token rather
   * than 404, so the page can distinguish "not issued" from "the API is down".
   */
  verifyDocument: (token: string) =>
    publicGet<DocumentVerificationResult>(`/documents/verify/${encodeURIComponent(token)}`),

  // ---------------------------------------------------------------- auth
  register: (body: { email: string; password: string; fullName: string; phone?: string }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ accessToken: string }>('/customer/auth/register', {
          method: 'POST',
          body,
          anonymous: true,
        }),
  login: (email: string, password: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<
          | { accessToken: string }
          | { mfaRequired: true; challengeToken: string }
        >('/customer/auth/login', { method: 'POST', body: { email, password }, anonymous: true }),
  verifyMfaLogin: (challengeToken: string, code: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ accessToken: string }>('/customer/auth/mfa/verify-login', {
          method: 'POST',
          body: { challengeToken, code },
          anonymous: true,
        }),
  logout: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ loggedOut: true })
      : request<{ loggedOut: boolean }>('/customer/auth/logout', { method: 'POST', body: {} }),
  forgotPassword: (email: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ accepted: boolean }>('/customer/auth/forgot-password', {
          method: 'POST',
          body: { email },
          anonymous: true,
        }),
  resetPassword: (token: string, password: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ reset: boolean }>('/customer/auth/reset-password', {
          method: 'POST',
          body: { token, password },
          anonymous: true,
        }),
  me: () => (IS_STATIC_PREVIEW ? Promise.resolve(PREVIEW_PROFILE) : request<CustomerProfile>('/customer/auth/me')),
  updateProfile: (body: { fullName?: string; phone?: string; preferredLocale?: 'ar' | 'en'; preferredTheme?: 'dark' | 'light' }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<CustomerProfile>('/customer/auth/profile', { method: 'POST', body }),

  // -------------------------------------------------------------- garage
  vehicles: () => (IS_STATIC_PREVIEW ? Promise.resolve(PREVIEW_VEHICLES) : request<Vehicle[]>('/customer/vehicles')),
  addVehicle: (body: {
    vin: string;
    make: string;
    model: string;
    modelYear: number;
    plateNumber?: string;
    color?: string;
    mileage?: number;
  }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<Vehicle>('/customer/vehicles', { method: 'POST', body }),
  vehicle: (id: string) =>
    IS_STATIC_PREVIEW
      ? (() => {
          const found = PREVIEW_VEHICLES.find((v) => v.id === id);
          if (!found) throw new ApiError(404, 'not_found', 'Vehicle not found.');
          return Promise.resolve(found);
        })()
      : request<Vehicle>(`/customer/vehicles/${id}`),
  vehicleHistory: (id: string) =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ items: [] as Array<Record<string, unknown>> })
      : request<{ items: Array<Record<string, unknown>> }>(`/customer/vehicles/${id}/history`),
  removeVehicle: (id: string) =>
    IS_STATIC_PREVIEW ? previewReadOnly() : request<void>(`/customer/vehicles/${id}`, { method: 'DELETE' }),

  // ----------------------------------------------------------- addresses
  addresses: () =>
    IS_STATIC_PREVIEW ? Promise.resolve(PREVIEW_ADDRESSES) : request<Address[]>('/customer/addresses'),
  addAddress: (body: {
    label?: string;
    addressLine1: string;
    city: string;
    countryCode?: string;
    isDefault?: boolean;
  }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<Address>('/customer/addresses', { method: 'POST', body }),
  removeAddress: (id: string) =>
    IS_STATIC_PREVIEW ? previewReadOnly() : request<void>(`/customer/addresses/${id}`, { method: 'DELETE' }),

  // ------------------------------------------------------------- privacy
  privacy: () =>
    IS_STATIC_PREVIEW ? Promise.resolve(PREVIEW_PRIVACY) : request<PrivacySettings>('/customer/privacy'),
  updatePrivacy: (body: Partial<PrivacySettings>) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<PrivacySettings>('/customer/privacy', { method: 'PATCH', body }),
  requestDataExport: (reason?: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ recorded: boolean }>('/customer/privacy/data-export', { method: 'POST', body: { reason } }),
  requestDeletion: (reason?: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ recorded: boolean }>('/customer/privacy/deletion', { method: 'POST', body: { reason } }),
  notificationPreferences: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve(PREVIEW_NOTIFICATION_PREFERENCES)
      : request<NotificationPreference[]>('/customer/notification-preferences'),
  updateNotificationPreferences: (items: NotificationPreference[]) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<NotificationPreference[]>('/customer/notification-preferences', {
          method: 'PATCH',
          body: { preferences: items },
        }),

  // ------------------------------------------------------------ bookings
  availability: (params: { date: string; durationMinutes: number; serviceRef?: string }) => {
    if (IS_STATIC_PREVIEW) return Promise.resolve([] as AvailableSlot[]);
    const qs = new URLSearchParams({
      date: params.date,
      durationMinutes: String(params.durationMinutes),
    });
    if (params.serviceRef) qs.set('serviceRef', params.serviceRef);
    return request<AvailableSlot[]>(`/customer/bookings/availability?${qs.toString()}`);
  },
  /**
   * Which of the next days are bookable.
   *
   * The booking form uses this to disable closed days and jump to the first
   * open one, so a customer never lands on a day the engine will answer with an
   * empty slot list.
   */
  availabilityDays: (params: { from: string; durationMinutes: number; days?: number; serviceRef?: string }) => {
    if (IS_STATIC_PREVIEW) return Promise.resolve([] as AvailableDay[]);
    const qs = new URLSearchParams({
      from: params.from,
      durationMinutes: String(params.durationMinutes),
    });
    if (params.days) qs.set('days', String(params.days));
    if (params.serviceRef) qs.set('serviceRef', params.serviceRef);
    return request<AvailableDay[]>(`/customer/bookings/availability-days?${qs.toString()}`);
  },
  createBooking: (body: {
    bookingType: 'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE';
    startsAt: string;
    durationMinutes: number;
    vehicleId?: string;
    serviceRef?: string;
    notes?: string;
  }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<BookingSlot>('/customer/bookings', { method: 'POST', body }),
  bookings: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ items: PREVIEW_BOOKINGS, total: PREVIEW_BOOKINGS.length })
      : request<{ items: BookingSlot[]; total: number }>('/customer/bookings?pageSize=50'),
  cancelBooking: (id: string, reason: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<BookingSlot>(`/customer/bookings/${id}/cancel`, { method: 'POST', body: { reason } }),

  // ------------------------------------------------------------ payments
  payments: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ items: PREVIEW_PAYMENTS, total: PREVIEW_PAYMENTS.length })
      : request<{ items: PaymentRecord[]; total: number }>('/customer/payments?pageSize=50'),

  // ------------------------------------------------------- notifications
  notifications: (unreadOnly = false) =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({
          items: unreadOnly ? PREVIEW_NOTIFICATIONS.filter((n) => !n.readAt) : PREVIEW_NOTIFICATIONS,
          total: PREVIEW_NOTIFICATIONS.length,
        })
      : request<{ items: NotificationItem[]; total: number }>(
          `/customer/notifications?pageSize=50${unreadOnly ? '&unreadOnly=true' : ''}`,
        ),
  markNotificationsRead: (ids: string[]) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ updated: number }>('/customer/notifications/read', { method: 'POST', body: { ids } }),
  markAllNotificationsRead: () =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ updated: number }>('/customer/notifications/read-all', { method: 'POST', body: {} }),

  // ---------------------------------------------------------- marketplace
  serviceRequests: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ items: PREVIEW_SERVICE_REQUESTS, total: PREVIEW_SERVICE_REQUESTS.length })
      : request<{ items: ServiceRequestRecord[]; total: number }>('/customer/marketplace/requests?pageSize=50'),
  createServiceRequest: (body: {
    categoryKey: string;
    description?: string;
    vehicleId?: string;
  }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<ServiceRequestRecord>('/customer/marketplace/requests', { method: 'POST', body }),
  cancelServiceRequest: (id: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<ServiceRequestRecord>(`/customer/marketplace/requests/${id}/cancel`, {
          method: 'POST',
          body: {},
        }),
  submitReview: (body: { serviceRequestId: string; rating: number; comment?: string }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ id: string; rating: number }>('/customer/marketplace/reviews', { method: 'POST', body }),
  disputes: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ items: [] as DisputeRecord[], total: 0 })
      : request<{ items: DisputeRecord[]; total: number }>('/customer/marketplace/disputes?pageSize=50'),
  openDispute: (body: { serviceRequestId: string; subject?: string; description: string }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<DisputeRecord>('/customer/marketplace/disputes', { method: 'POST', body }),
  disputeMessage: (id: string, body: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ id: string }>(`/customer/marketplace/disputes/${id}/messages`, {
          method: 'POST',
          body: { body },
        }),

  // ---------------------------------------------------------- marketplace
  /**
   * The shopping cart.
   *
   * Every call is authenticated and resolved from the bearer token, so a cart
   * can never be read or written for another account.
   */
  cart: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ items: [], totalMinor: 0, itemCount: 0 } as Cart)
      : request<Cart>('/customer/cart'),
  addCartItem: (productId: string, quantity = 1) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<Cart>('/customer/cart/items', { method: 'POST', body: { productId, quantity } }),
  setCartQuantity: (productId: string, quantity: number) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<Cart>(`/customer/cart/items/${encodeURIComponent(productId)}`, {
          method: 'PATCH',
          body: { quantity },
        }),
  removeCartItem: (productId: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<Cart>(`/customer/cart/items/${encodeURIComponent(productId)}`, { method: 'DELETE' }),
  clearCart: () =>
    IS_STATIC_PREVIEW ? previewReadOnly() : request<Cart>('/customer/cart', { method: 'DELETE' }),

  /** Saved products. */
  favorites: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ items: [] as CatalogProduct[], total: 0 })
      : request<{ items: CatalogProduct[]; total: number }>('/customer/favorites'),
  addFavorite: (productId: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<{ id: string }>('/customer/favorites', { method: 'POST', body: { productId } }),
  removeFavorite: (productId: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<void>(`/customer/favorites/${encodeURIComponent(productId)}`, { method: 'DELETE' }),

  /** Order history and placement from the cart. */
  orders: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ items: [] as CustomerOrder[], total: 0 })
      : request<{ items: CustomerOrder[]; total: number }>('/customer/orders?pageSize=50'),
  order: (id: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<CustomerOrder>(`/customer/orders/${encodeURIComponent(id)}`),
  placeOrder: (body: { paymentMethod: string; addressId?: string; notes?: string; idempotencyKey?: string }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<CustomerOrder>('/customer/orders', { method: 'POST', body }),
  cancelOrder: (id: string, reason?: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<CustomerOrder>(`/customer/orders/${encodeURIComponent(id)}/cancel`, {
          method: 'POST',
          body: { reason },
        }),

  // ------------------------------------------------- planned ecosystem (P4)
  /**
   * Requests for quotation (P4).
   *
   * A consumer raises a request for a part that is not in the catalogue, approved
   * providers quote, and the consumer accepts exactly one quote. The account is
   * resolved from the bearer token, so no account id is sent.
   */
  rfqs: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ items: [] as RfqRecord[], total: 0 })
      : request<{ items: RfqRecord[]; total: number }>('/customer/rfqs'),
  rfq: (id: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<RfqRecord>(`/customer/rfqs/${encodeURIComponent(id)}`),
  createRfq: (body: { categoryKey: string; description: string; quantity?: number; vehicleId?: string; validDays?: number }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<RfqRecord>('/customer/rfqs', { method: 'POST', body }),
  cancelRfq: (id: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<RfqRecord>(`/customer/rfqs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} }),
  acceptRfqQuote: (id: string, quoteId: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<RfqRecord>(
          `/customer/rfqs/${encodeURIComponent(id)}/quotes/${encodeURIComponent(quoteId)}/accept`,
          { method: 'POST', body: {} },
        ),

  /**
   * Consumer order returns (P4).
   *
   * A return is only accepted inside the server's window and only for the
   * caller's own delivered order.
   */
  returns: () =>
    IS_STATIC_PREVIEW
      ? Promise.resolve({ items: [] as CustomerReturnRecord[], total: 0 })
      : request<{ items: CustomerReturnRecord[]; total: number }>('/customer/returns'),
  createReturn: (orderId: string, body: { reason: string; lines: Array<{ orderLineId: string; quantity: number }> }) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<CustomerReturnRecord>(`/customer/orders/${encodeURIComponent(orderId)}/returns`, {
          method: 'POST',
          body,
        }),
  cancelReturn: (id: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<CustomerReturnRecord>(`/customer/returns/${encodeURIComponent(id)}/cancel`, {
          method: 'POST',
          body: {},
        }),

  /** Part fitment against the caller's own garage (P4). */
  checkFitment: (vehicleId: string, productId: string) =>
    IS_STATIC_PREVIEW
      ? previewReadOnly()
      : request<FitmentResult>(`/customer/fitment?vehicleId=${encodeURIComponent(vehicleId)}&productId=${encodeURIComponent(productId)}`),
};

/**
 * Public content, safe to fetch from a server component.
 *
 * In the static export these resolve from the bundled preview data instead of
 * the API, because there is no API to reach. `preview-data.ts` documents the
 * limits of that data; every page that shows it also shows a preview notice.
 */
export const publicApi = {
  /**
   * The catalogue categories the admin CMS maintains.
   *
   * Read from the same `ServiceCategory` rows the control panel edits, so a
   * category cannot appear on the site that an operator cannot manage.
   */
  categories: async (locale: string) => {
    if (IS_STATIC_PREVIEW) {
      const items = SERVICE_CATEGORIES.map((c) => ({
        key: c.key,
        name: locale === 'ar' ? c.nameAr : c.nameEn,
        icon: null as string | null,
        domain: null as string | null,
        imageUrl: null as string | null,
      }));
      return { items, total: items.length };
    }
    return publicGet<{ items: CatalogCategory[]; total: number }>(
      `/customer/catalog/categories?locale=${locale}`,
    );
  },

  /** The published product catalogue, filtered and paginated. */
  products: async (
    params: {
      locale: string;
      companyId?: string;
      query?: string;
      sort?: 'relevance' | 'price_asc' | 'price_desc' | 'name';
      page?: number;
      pageSize?: number;
    },
  ) => {
    if (IS_STATIC_PREVIEW) {
      const result = previewProducts({
        locale: params.locale,
        query: params.query,
        sort: params.sort,
      });
      return { items: result.items, total: result.total, page: 1, pageSize: result.items.length };
    }
    const qs = new URLSearchParams({ locale: params.locale });
    if (params.companyId) qs.set('companyId', params.companyId);
    if (params.query) qs.set('query', params.query);
    if (params.sort) qs.set('sort', params.sort);
    qs.set('page', String(params.page ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 20));
    return publicGet<{ items: CatalogProduct[]; total: number; page: number; pageSize: number }>(
      `/customer/catalog/products?${qs.toString()}`,
    );
  },

  /** One product with its images, store and related items. */
  product: async (id: string, locale: string) => {
    if (IS_STATIC_PREVIEW) {
      const found = previewProductDetail(id, locale);
      if (!found) throw new ApiError(404, 'not_found', 'Product not found.');
      return found;
    }
    return publicGet<CatalogProduct & { images: Array<{ url: string | null }>; related: CatalogProduct[] }>(
      `/customer/catalog/products/${encodeURIComponent(id)}?locale=${locale}`,
    );
  },

  /** The marketplace stores that actually have published products. */
  stores: async (locale: string) => {
    if (IS_STATIC_PREVIEW) return previewStores(locale);
    return publicGet<{ items: CatalogStore[]; total: number }>(
      `/customer/catalog/stores?locale=${locale}`,
    );
  },

  /**
   * The active promotional offers.
   *
   * The service filters to active offers from approved providers inside their
   * window, so an expired or unapproved offer is never advertised.
   */
  offers: async (categoryKey?: string, limit = 12) => {
    if (IS_STATIC_PREVIEW) return [] as ProviderOffer[];
    const qs = new URLSearchParams({ limit: String(limit) });
    if (categoryKey) qs.set('categoryKey', categoryKey);
    return publicGet<ProviderOffer[]>(`/customer/catalog/offers?${qs.toString()}`);
  },

  /**
   * Approved providers, optionally filtered by category.
   *
   * When `origin` is supplied the API returns only providers that have Auto Map
   * coordinates inside `radiusKm`, nearest first. Without an origin the list is
   * alphabetical and no provider is silently dropped.
   */
  providers: async (
    categoryKey?: string,
    origin?: { latitude: number; longitude: number; radiusKm?: number },
  ) => {
    if (IS_STATIC_PREVIEW) {
      const items = previewProviders(categoryKey);
      return { items, total: items.length };
    }
    const qs = new URLSearchParams({ pageSize: '50' });
    if (categoryKey) qs.set('categoryKey', categoryKey);
    if (origin) {
      qs.set('lat', String(origin.latitude));
      qs.set('lng', String(origin.longitude));
      if (origin.radiusKm !== undefined) qs.set('radiusKm', String(origin.radiusKm));
    }
    return publicGet<{ items: ProviderSummary[]; total: number }>(`/marketplace/providers?${qs.toString()}`);
  },
  provider: async (id: string) => {
    if (IS_STATIC_PREVIEW) {
      const found = previewProvider(id);
      if (!found) throw new ApiError(404, 'not_found', 'Provider not found.');
      return found;
    }
    return publicGet<ProviderDetail>(`/marketplace/providers/${id}`);
  },
  /** Published website content managed in the admin CMS. */
  website: async (locale: string) => {
    if (IS_STATIC_PREVIEW) return previewWebsiteContent(locale);
    return publicGet<WebsiteContent>(`/cms/public/website?locale=${locale}`);
  },
  applyAsProvider: (body: {
    legalNameEn: string;
    legalNameAr: string;
    contactEmail: string;
    contactPhone: string;
    registrationNumber?: string;
    countryCode?: string;
    city?: string;
    categoryKeys?: string[];
  }) =>
    fetch(`${API_BASE}/v1/marketplace/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new ApiError(res.status, detail.code ?? 'request_failed', detail.message ?? 'Failed');
      }
      return (await res.json()) as { id: string; status: string };
    }),
};

/** Service categories offered by the platform. */
export const SERVICE_CATEGORIES = SHARED_SERVICE_CATEGORIES;

// ------------------------------------------------- dynamic website content

export interface MediaVariant {
  key: string;
  width: number;
  height: number;
  byteSize: number;
}

export interface CmsMedia {
  id: string;
  width: number;
  height: number;
  altAr: string | null;
  altEn: string | null;
  dominantColor: string | null;
  blurDataUrl: string | null;
  variants: Record<string, MediaVariant>;
  url: string;
}

export interface WebsiteBlock {
  key: string;
  value: string;
  body: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  sortOrder: number;
  media: CmsMedia | null;
}

export interface WebsiteBanner {
  placement: string;
  title: string;
  subtitle: string | null;
  actionUrl: string | null;
  sortOrder: number;
  imageUrl: string | null;
  media: CmsMedia | null;
}

export interface WebsiteCategory {
  key: string;
  nameEn: string;
  nameAr: string;
  domain: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  media: CmsMedia | null;
}

export interface WebsiteContent {
  locale: string;
  blocks: WebsiteBlock[];
  banners: WebsiteBanner[];
  categories: WebsiteCategory[];
}

/** Empty payload used when the CMS is unreachable, so a page still renders. */
export const EMPTY_WEBSITE: WebsiteContent = { locale: 'ar', blocks: [], banners: [], categories: [] };

/**
 * Resolves a CMS image to a servable URL at the requested size.
 *
 * The API serves bytes by asset id rather than exposing storage paths, so the
 * URL is always `/cms/media/<id>/file`. `variant` picks a pre-generated size,
 * which keeps a phone from downloading the 2400px hero.
 */
export function mediaUrl(media: CmsMedia | null, variant = 'card'): string | null {
  if (!media) return null;
  const chosen = media.variants[variant] ? variant : Object.keys(media.variants)[0];
  return `${API_BASE}/v1/cms/media/${media.id}/file?variant=${chosen}`;
}

/** The API origin, without the `/api` suffix `API_BASE` carries. */
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

/**
 * Resolve an image path the API returned into a URL the browser can load.
 *
 * The catalogue endpoints return media as `/api/v1/cms/media/<id>/file`, which
 * is relative to the API origin. The customer site is served from its own
 * origin, so rendering that path verbatim makes the browser request the website
 * and 404 — the picture silently disappears. Bundled assets (`/media/...`,
 * `/art/...`) are served by the site itself, so they keep the base-path prefix
 * instead, and an absolute URL is returned unchanged.
 */
export function resolveImage(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/api/')) return `${API_ORIGIN}${path}`;
  return assetUrl(path);
}

/** Looks up a published content block by key, returning null when absent. */
export function block(content: WebsiteContent, key: string): WebsiteBlock | null {
  return content.blocks.find((b) => b.key === key) ?? null;
}

/** The value of a content block, or a fallback when it has not been authored. */
export function blockValue(content: WebsiteContent, key: string, fallback: string): string {
  const found = block(content, key);
  return found && found.value ? found.value : fallback;
}

/** Localised alt text for a CMS image. */
export function mediaAlt(media: CmsMedia | null, locale: string, fallback: string): string {
  if (!media) return fallback;
  const alt = locale === 'ar' ? media.altAr : media.altEn;
  return alt && alt.trim() ? alt : fallback;
}

/**
 * The image for a service category.
 *
 * Three sources in priority order: the photograph an administrator attached in
 * the CMS, the bundled photograph for that service, then the vector motif. The
 * bundled photograph is the fallback in every deployment, not only the static
 * preview, so an unreachable CMS degrades to a correct picture of the service
 * rather than to abstract art. The result is always a servable URL, so a
 * category tile can never render an empty or broken image.
 */
export function categoryImage(
  media: CmsMedia | null,
  categoryKey: string,
  variant = 'card',
): string {
  const fromCms = mediaUrl(media, variant);
  if (fromCms) return fromCms;
  const bundled = sitePhotoForCategory(categoryKey);
  if (bundled) return assetUrl(bundled.src);
  return assetUrl(categoryArt(categoryKey));
}
