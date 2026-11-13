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

import type { Locale, SiteContent } from '@oryx/shared';

/**
 * Browser API base.
 *
 * The customer site is always served same-origin with its own `/api` rewrite
 * (see `next.config.ts`), so the browser talks to the relative `/api` path and
 * never an absolute origin — an absolute `http://…` base baked in at build time
 * becomes mixed content the moment the site is served over HTTPS. This is
 * deliberately a customer-specific variable so the shared staff/admin
 * `NEXT_PUBLIC_API_BASE_URL` cannot leak in here.
 */
const API_BASE = process.env.NEXT_PUBLIC_CUSTOMER_API_BASE_URL ?? '/api';

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

let refreshInFlight: Promise<boolean> | null = null;

/** Rotate the consumer session; concurrent 401s share one rotation. */
async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
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
        if (!res.ok) {
          customerSession.clear();
          return false;
        }
        const data = (await res.json()) as { accessToken: string };
        customerSession.setAccessToken(data.accessToken);
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

/** Restore a session after a reload, using the HttpOnly refresh cookie. */
export async function restoreCustomerSession(): Promise<boolean> {
  if (accessToken) return true;
  return refreshSession();
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
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, { ...options, noRetry: true });
    customerSession.notifySessionLost();
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

export interface DisputeRecord {
  id: string;
  status: string;
  subject: string | null;
  createdAt: string;
  messages?: Array<{ id: string; body: string; authorKind: string; isInternal: boolean }>;
}

export interface StorefrontProduct {
  id: string;
  sku: string;
  partNumber: string | null;
  nameEn: string;
  nameAr: string;
  brand: string | null;
  categoryKey: string | null;
  condition: 'NEW' | 'REFURBISHED';
  priceMinor: number;
  compareAtPriceMinor: number | null;
  currency: string;
  currencyScale: number;
  taxRateBp: number;
  image: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  warrantyEn: string | null;
  warrantyAr: string | null;
  engineType: string | null;
  unit: string;
  isFeatured: boolean;
  inStock: boolean;
  onHand: number;
  fits: Array<{ make: string; model: string; yearFrom: number; yearTo: number | null }>;
}

export interface StorefrontContext {
  companyId: string;
  nameEn: string;
  nameAr: string;
  currency: string;
  currencyScale: number;
  countryCode: string | null;
}

export interface StorefrontService {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  image: string;
  durationMinutes: number;
  priceMinor: number | null;
  turnaroundEn: string;
  turnaroundAr: string;
  branchIds: string[];
}

export interface StorefrontBranch {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  city: string | null;
  countryCode: string | null;
  addressLine: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  timezone: string;
  image: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  services: string[];
  isPublished: boolean;
  hasCoordinates: boolean;
  latitude: number | null;
  longitude: number | null;
  bookable: boolean;
  workingHours: Array<{
    dayOfWeek: number;
    opensMinute: number;
    closesMinute: number;
    isClosed: boolean;
  }>;
}

export interface StorefrontCategory {
  key: string;
  nameEn: string;
  nameAr: string;
  image: string;
  productCount: number;
}

export interface StorefrontFacets {
  brands: Array<{ value: string; count: number }>;
  categories: Array<{ key: string; nameEn: string; nameAr: string; count: number }>;
  vehicles: Array<{
    make: string;
    models: Array<{ model: string; yearFrom: number; yearTo: number }>;
  }>;
  price: { minMinor: number; maxMinor: number };
  conditions: Array<{ value: 'NEW' | 'REFURBISHED'; count: number }>;
  engineTypes: Array<{ value: string; count: number }>;
}

export interface ProductPage {
  items: StorefrontProduct[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  currency: string;
  currencyScale: number;
}

export interface ProductFilters {
  search?: string;
  category?: string[];
  brand?: string[];
  make?: string[];
  model?: string[];
  year?: number;
  engineType?: string;
  partNumber?: string;
  priceMinMinor?: number;
  priceMaxMinor?: number;
  inStock?: boolean;
  condition?: string[];
  featured?: boolean;
  onOffer?: boolean;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'name_asc';
  page?: number;
  pageSize?: number;
}

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface PricedCart {
  items: Array<{
    productId: string;
    sku: string;
    nameEn: string;
    nameAr: string;
    quantity: number;
    unitPriceMinor: number;
    compareAtPriceMinor: number | null;
    taxPercentBp: number;
    image: string;
    lineSubtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    lineTotalMinor: number;
  }>;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  currencyScale: number;
}

export interface WebOrder {
  id: string;
  orderNumber: string;
  status: string;
  fulfilment: 'COLLECTION' | 'DELIVERY';
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  deliveryAddress: Record<string, unknown> | null;
  notes: string | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  currencyScale: number;
  createdAt: string;
  itemCount?: number;
  lines: Array<{
    sku: string;
    nameEn: string;
    nameAr: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }>;
}

export interface StorefrontAppointment {
  id: string;
  reference: string;
  status: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  serviceRef: string | null;
  branchId: string | null;
}

export interface AvailabilitySlot {
  startMinute: number;
  endMinute: number;
  startsAt: string;
  endsAt: string;
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

export const customerApi = {
  // ---------------------------------------------------------------- auth
  register: (body: { email: string; password: string; fullName: string; phone?: string }) =>
    request<{ accessToken: string }>('/customer/auth/register', {
      method: 'POST',
      body,
      anonymous: true,
    }),
  login: (email: string, password: string) =>
    request<
      | { accessToken: string }
      | { mfaRequired: true; challengeToken: string }
    >('/customer/auth/login', { method: 'POST', body: { email, password }, anonymous: true }),
  verifyMfaLogin: (challengeToken: string, code: string) =>
    request<{ accessToken: string }>('/customer/auth/mfa/verify-login', {
      method: 'POST',
      body: { challengeToken, code },
      anonymous: true,
    }),
  logout: () => request<{ loggedOut: boolean }>('/customer/auth/logout', { method: 'POST', body: {} }),
  forgotPassword: (email: string) =>
    request<{ accepted: boolean }>('/customer/auth/forgot-password', {
      method: 'POST',
      body: { email },
      anonymous: true,
    }),
  resetPassword: (token: string, password: string) =>
    request<{ reset: boolean }>('/customer/auth/reset-password', {
      method: 'POST',
      body: { token, password },
      anonymous: true,
    }),
  me: () => request<CustomerProfile>('/customer/auth/me'),
  updateProfile: (body: { fullName?: string; phone?: string; preferredLocale?: 'ar' | 'en'; preferredTheme?: 'dark' | 'light' }) =>
    request<CustomerProfile>('/customer/auth/profile', { method: 'POST', body }),

  // -------------------------------------------------------------- garage
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

  // ----------------------------------------------------------- addresses
  addresses: () => request<Address[]>('/customer/addresses'),
  addAddress: (body: {
    label?: string;
    addressLine1: string;
    city: string;
    countryCode?: string;
    isDefault?: boolean;
  }) => request<Address>('/customer/addresses', { method: 'POST', body }),
  removeAddress: (id: string) => request<void>(`/customer/addresses/${id}`, { method: 'DELETE' }),

  // ------------------------------------------------------------- privacy
  privacy: () => request<PrivacySettings>('/customer/privacy'),
  updatePrivacy: (body: Partial<PrivacySettings>) =>
    request<PrivacySettings>('/customer/privacy', { method: 'PATCH', body }),
  requestDataExport: (reason?: string) =>
    request<{ recorded: boolean }>('/customer/privacy/data-export', { method: 'POST', body: { reason } }),
  requestDeletion: (reason?: string) =>
    request<{ recorded: boolean }>('/customer/privacy/deletion', { method: 'POST', body: { reason } }),
  notificationPreferences: () =>
    request<NotificationPreference[]>('/customer/notification-preferences'),
  updateNotificationPreferences: (items: NotificationPreference[]) =>
    request<NotificationPreference[]>('/customer/notification-preferences', {
      method: 'PATCH',
      body: { preferences: items },
    }),

  // ------------------------------------------------------------ bookings
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
  bookings: () =>
    request<{ items: BookingSlot[]; total: number }>('/customer/bookings?pageSize=50'),
  cancelBooking: (id: string, reason: string) =>
    request<BookingSlot>(`/customer/bookings/${id}/cancel`, { method: 'POST', body: { reason } }),

  // ------------------------------------------------------------ payments
  payments: () =>
    request<{ items: PaymentRecord[]; total: number }>('/customer/payments?pageSize=50'),

  // ------------------------------------------------------- notifications
  notifications: (unreadOnly = false) =>
    request<{ items: NotificationItem[]; total: number }>(
      `/customer/notifications?pageSize=50${unreadOnly ? '&unreadOnly=true' : ''}`,
    ),
  markNotificationsRead: (ids: string[]) =>
    request<{ updated: number }>('/customer/notifications/read', { method: 'POST', body: { ids } }),
  markAllNotificationsRead: () =>
    request<{ updated: number }>('/customer/notifications/read-all', { method: 'POST', body: {} }),

  // ---------------------------------------------------------- marketplace
  serviceRequests: () =>
    request<{ items: ServiceRequestRecord[]; total: number }>('/customer/marketplace/requests?pageSize=50'),
  createServiceRequest: (body: {
    categoryKey: string;
    description?: string;
    vehicleId?: string;
  }) => request<ServiceRequestRecord>('/customer/marketplace/requests', { method: 'POST', body }),
  cancelServiceRequest: (id: string) =>
    request<ServiceRequestRecord>(`/customer/marketplace/requests/${id}/cancel`, {
      method: 'POST',
      body: {},
    }),
  submitReview: (body: { serviceRequestId: string; rating: number; comment?: string }) =>
    request<{ id: string; rating: number }>('/customer/marketplace/reviews', { method: 'POST', body }),
  disputes: () =>
    request<{ items: DisputeRecord[]; total: number }>('/customer/marketplace/disputes?pageSize=50'),
  openDispute: (body: { serviceRequestId: string; subject?: string; description: string }) =>
    request<DisputeRecord>('/customer/marketplace/disputes', { method: 'POST', body }),
  disputeMessage: (id: string, body: string) =>
    request<{ id: string }>(`/customer/marketplace/disputes/${id}/messages`, {
      method: 'POST',
      body: { body },
    }),

  // ----------------------------------------------------------- storefront
  quoteCart: (lines: CartLine[]) =>
    request<PricedCart>('/customer/storefront/cart/quote', { method: 'POST', body: { lines } }),
  placeOrder: (body: {
    lines: CartLine[];
    fulfilment: 'COLLECTION' | 'DELIVERY';
    branchId?: string;
    address?: {
      addressLine1: string;
      addressLine2?: string;
      city: string;
      area?: string;
      postalCode?: string;
    };
    contactName: string;
    contactPhone: string;
    contactEmail?: string;
    notes?: string;
    paymentMethod: 'CASH' | 'CARD_TERMINAL' | 'BANK_TRANSFER';
  }) => request<WebOrder>('/customer/storefront/orders', { method: 'POST', body }),
  orders: (page = 1, pageSize = 20) =>
    request<{ items: WebOrder[]; total: number; pageCount: number }>(
      `/customer/storefront/orders?page=${page}&pageSize=${pageSize}`,
    ),
  order: (id: string) => request<WebOrder>(`/customer/storefront/orders/${id}`),
  wishlist: () => request<StorefrontProduct[]>('/customer/storefront/wishlist'),
  wishlistIds: () => request<string[]>('/customer/storefront/wishlist/ids'),
  toggleWishlist: (productId: string) =>
    request<{ saved: boolean }>(`/customer/storefront/wishlist/${productId}`, {
      method: 'POST',
      body: {},
    }),
  removeWishlist: (productId: string) =>
    request<{ saved: boolean }>(`/customer/storefront/wishlist/${productId}`, { method: 'DELETE' }),
  bookAppointment: (body: {
    customerName: string;
    phone: string;
    email?: string;
    vehicleId?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: number;
    plateNumber?: string;
    serviceRef: string;
    branchId?: string;
    startsAt: string;
    durationMinutes?: number;
    notes?: string;
    bookingType: 'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE';
  }) => request<StorefrontAppointment>('/customer/storefront/appointments', { method: 'POST', body }),
  appointments: (page = 1, pageSize = 20) =>
    request<{ items: StorefrontAppointment[]; total: number; pageCount: number }>(
      `/customer/storefront/appointments?page=${page}&pageSize=${pageSize}`,
    ),
};

/** Serialise a storefront filter object into a query string. */
function storefrontQuery(filters: ProductFilters): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) qs.set(key, value.join(','));
    } else {
      qs.set(key, String(value));
    }
  }
  const text = qs.toString();
  return text ? `?${text}` : '';
}

/** Public content, safe to fetch from a server component. */
export const publicApi = {
  storefrontContext: () => publicGet<StorefrontContext>('/storefront/context'),
  /** Editable website content, merged over the approved defaults by the API. */
  siteContent: (locale: Locale) =>
    publicGet<{ locale: string; site: SiteContent }>(
      `/cms/public/content?locale=${locale === 'en' ? 'en' : 'ar'}`,
    ),
  storefrontServices: () => publicGet<StorefrontService[]>('/storefront/services'),
  storefrontBranches: () => publicGet<StorefrontBranch[]>('/storefront/branches'),
  storefrontCategories: () => publicGet<StorefrontCategory[]>('/storefront/categories'),
  storefrontFacets: () => publicGet<StorefrontFacets>('/storefront/products/facets'),
  storefrontProducts: (filters: ProductFilters = {}) =>
    publicGet<ProductPage>(`/storefront/products${storefrontQuery(filters)}`),
  storefrontProduct: (idOrSku: string) =>
    publicGet<StorefrontProduct>(`/storefront/products/${encodeURIComponent(idOrSku)}`),
  storefrontRelated: (id: string, limit = 4) =>
    publicGet<StorefrontProduct[]>(`/storefront/products/${id}/related?limit=${limit}`),
  storefrontFeatured: (limit = 8) =>
    publicGet<StorefrontProduct[]>(`/storefront/products/featured?limit=${limit}`),
  storefrontOffers: (limit = 8) => publicGet<StorefrontProduct[]>(`/storefront/offers?limit=${limit}`),
  storefrontQuote: (lines: CartLine[]) =>
    request<PricedCart>('/storefront/cart/quote', { method: 'POST', body: { lines }, anonymous: true }),
  storefrontSuggest: (q: string, limit = 8) =>
    publicGet<Array<{ kind: string; label: string; sublabel?: string; href: string }>>(
      `/storefront/products/suggest?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
  storefrontAvailability: (params: { date: string; durationMinutes: number; branchId?: string }) => {
    const qs = new URLSearchParams({
      date: params.date,
      durationMinutes: String(params.durationMinutes),
    });
    if (params.branchId) qs.set('branchId', params.branchId);
    return publicGet<{ date: string; slots: AvailabilitySlot[] }>(
      `/storefront/availability?${qs.toString()}`,
    );
  },
  storefrontAvailabilityDays: (params: { days?: number; durationMinutes: number; branchId?: string }) => {
    const qs = new URLSearchParams({
      days: String(params.days ?? 14),
      durationMinutes: String(params.durationMinutes),
    });
    if (params.branchId) qs.set('branchId', params.branchId);
    return publicGet<{ days: Array<{ date: string; slots: number }> }>(
      `/storefront/availability/days?${qs.toString()}`,
    );
  },
  contact: (body: {
    fullName: string;
    email: string;
    phone?: string;
    subject?: string;
    message: string;
    branchId?: string;
    locale?: 'ar' | 'en';
  }) =>
    request<{ id: string; received: boolean }>('/storefront/contact', {
      method: 'POST',
      body,
      anonymous: true,
    }),
  requestAppointment: (body: {
    customerName: string;
    phone: string;
    email?: string;
    vehicleId?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: number;
    plateNumber?: string;
    serviceRef: string;
    branchId?: string;
    startsAt: string;
    durationMinutes?: number;
    notes?: string;
    bookingType: 'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE';
  }) =>
    request<StorefrontAppointment>('/storefront/appointments', {
      method: 'POST',
      body,
      anonymous: true,
    }),
  providers: (categoryKey?: string) =>
    publicGet<{ items: ProviderSummary[]; total: number }>(
      `/marketplace/providers?pageSize=50${categoryKey ? `&categoryKey=${encodeURIComponent(categoryKey)}` : ''}`,
    ),
  provider: (id: string) => publicGet<ProviderDetail>(`/marketplace/providers/${id}`),
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

/**
 * The automotive service taxonomy, re-exported from the shared catalogue so the
 * website, the API and the booking engine all read one list.
 */
export { SERVICE_CATEGORIES, PART_CATEGORIES } from '@oryx/shared';
