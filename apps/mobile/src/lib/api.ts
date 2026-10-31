/**
 * The typed API client.
 *
 * One place where the app talks to the backend, so timeouts, error shapes,
 * authentication and offline detection are defined once rather than per screen.
 *
 * ## Offline Demo Mode stays separate
 *
 * This client never falls back to demo data. If a request fails, the caller gets
 * a typed failure and decides what to show. That separation is deliberate: an
 * app that silently substitutes seeded records for a failed API call presents
 * invented bookings and prices as if they were real, which is exactly what the
 * owner asked not to happen. `isOffline()` exists so a screen can say "you are
 * offline" rather than pretending it has data.
 *
 * ## Authentication
 *
 * The consumer access token is held in memory and attached as a bearer header.
 * It is never written to storage: a stored access token outlives the session and
 * is readable by anything with access to the store. The refresh token lives in
 * the platform keychain, handled by `session-storage.ts`.
 */
import { getSecret } from './session-storage';

/** Where the API lives. Set by `EXPO_PUBLIC_API_BASE_URL` at build time. */
const BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api').replace(
  /\/$/,
  '',
);

/** The API version prefix. Every route is under `/api/v1`. */
const V1 = `${BASE_URL}/v1`;

/** How long a request may take before it is abandoned. */
const TIMEOUT_MS = 12_000;

/** The key the refresh token is stored under, shared with `app-context`. */
const SESSION_KEY = 'oryx.marketplace.session';

// ------------------------------------------------------------------ errors

export type ApiErrorKind =
  | 'offline'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'server'
  | 'unknown';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number | null,
    message: string,
    /** Field-level messages from the API's validation pipe, when it sent any. */
    readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return this.kind === 'offline' || this.kind === 'timeout' || this.kind === 'server';
  }
}

function classify(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Reads the API's error body, which is either Nest's shape or plain text. */
async function toError(response: Response): Promise<ApiError> {
  let message = `Request failed with status ${response.status}`;
  let details: string[] | undefined;
  try {
    const body = (await response.json()) as { message?: unknown };
    if (Array.isArray(body.message)) {
      details = body.message.map(String);
      message = details[0] ?? message;
    } else if (typeof body.message === 'string') {
      message = body.message;
    }
  } catch {
    /* a non-JSON error body is not worth a second failure */
  }
  return new ApiError(classify(response.status), response.status, message, details);
}

// ---------------------------------------------------------------- session

/**
 * The in-memory access token.
 *
 * Module-scoped rather than in React state so a non-component caller can read it
 * without a hook, and so it is dropped when the JS context is destroyed.
 */
let accessToken: string | null =
  // A check harness may seed a session before the bundle runs. The app itself
  // never writes here; it calls `setAccessToken` after a real sign-in.
  (globalThis as { __oryxAccessToken?: string }).__oryxAccessToken ?? null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * The staff (merchant) access token, kept apart from the consumer token.
 *
 * The API enforces two identity planes — a consumer token is refused on a staff
 * route and the reverse — so the client keeps two slots rather than one. Sharing
 * a single slot would mean signing in as a merchant silently replaced a customer
 * session, and the failure would surface later as a confusing 401 on the wrong
 * screen. Two slots make the separation explicit here as well as on the server.
 */
let staffAccessToken: string | null =
  (globalThis as { __oryxStaffAccessToken?: string }).__oryxStaffAccessToken ?? null;

export function setStaffAccessToken(token: string | null): void {
  staffAccessToken = token;
}

export function getStaffAccessToken(): string | null {
  return staffAccessToken;
}

/**
 * Whether the device currently has a usable connection.
 *
 * Read from the platform's own signal rather than inferred from a failed request,
 * so a screen can distinguish "you are offline" from "the server said no".
 */
export function isOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

// ---------------------------------------------------------------- request

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Attach the bearer token. Default true. */
  auth?: boolean;
  /** Which identity plane's token to attach. Default `customer`. */
  plane?: 'customer' | 'staff';
  /** Abort after this many milliseconds instead of the default. */
  timeoutMs?: number;
  /** A caller-supplied signal, for a screen that unmounts mid-request. */
  signal?: AbortSignal;
}

/**
 * Performs one request.
 *
 * Never throws a transport error: a network failure becomes an `ApiError` with
 * `kind: 'offline'` or `'timeout'`, so every caller handles failure the same way
 * and no screen has to wrap a call in try/catch for the common cases.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, plane = 'customer', timeoutMs = TIMEOUT_MS, signal } = options;

  // A known-offline device is not worth a 12-second wait.
  if (isOffline()) {
    throw new ApiError('offline', null, 'No internet connection');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // A caller's signal cancels this request too, without replacing the timeout.
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    // The API returns the refresh token in the body only for this client kind.
    // A native app has no cookie jar, so the cookie-only path would leave it
    // unable to rotate a session.
    'x-oryx-client': 'mobile',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = plane === 'staff' ? staffAccessToken : accessToken;
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${V1}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) throw await toError(response);
    // A 204 has no body; returning undefined is correct for a DELETE.
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      // Distinguish the caller cancelling from the clock running out.
      if (signal?.aborted) throw new ApiError('unknown', null, 'Request cancelled');
      throw new ApiError('timeout', null, 'The request took too long');
    }
    // A fetch rejection with no response is the network.
    throw new ApiError('offline', null, 'Could not reach the server');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Retries a request when — and only when — retrying is safe.
 *
 * A GET is idempotent and is retried on a network failure. A POST or PATCH is
 * not: retrying an add could double a quantity if the first attempt reached the
 * server and only the response was lost. Those are never retried automatically;
 * the caller decides, because only the caller knows whether the operation is
 * safe to repeat.
 */
export async function requestWithRetry<T>(
  path: string,
  options: RequestOptions = {},
  attempts = 2,
): Promise<T> {
  const method = options.method ?? 'GET';
  const safeToRetry = method === 'GET';
  let lastError: unknown;

  for (let attempt = 0; attempt < (safeToRetry ? attempts : 1); attempt += 1) {
    try {
      return await request<T>(path, options);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ApiError) || !error.isRetryable) throw error;
      if (attempt < attempts - 1) {
        // A short backoff, so a briefly unavailable server is not hammered.
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// --------------------------------------------------------------- payloads

/** The homepage response, matching `CustomerHomepageService.getHomepage`. */
export interface HomepageResponse {
  locale: 'ar' | 'en';
  hero: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    imageUrl: string | null;
    actionUrl: string | null;
  }>;
  categories: Array<{ key: string; name: string; icon: string | null; imageUrl: string | null }>;
  providers: Array<{
    id: string;
    name: string;
    categoryKey: string | null;
    fromPriceMinor: number | null;
    currency: string | null;
  }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    priceMinor: number;
    imageUrl: string | null;
  }>;
  /** True when the CMS has nothing published and the app should use its bundled Hero. */
  heroFallbackRequired: boolean;
}

export interface CartResponse {
  items: Array<{
    id: string;
    productId: string;
    sku: string;
    nameEn: string;
    nameAr: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
    available: boolean;
  }>;
  totalMinor: number;
  itemCount: number;
}

export interface FavoriteResponse {
  id: string;
  productId: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  priceMinor: number;
  available: boolean;
  createdAt: string;
}

// ------------------------------------------------------------- endpoints

export const api = {
  /** The approved homepage content. Public — no token needed. */
  homepage: (locale: 'ar' | 'en', signal?: AbortSignal) =>
    requestWithRetry<HomepageResponse>(`/customer/homepage?locale=${locale}`, { auth: false, signal }),

  cart: {
    get: (signal?: AbortSignal) => requestWithRetry<CartResponse>('/customer/cart', { signal }),
    add: (productId: string, quantity = 1) =>
      request<CartResponse['items'][number]>('/customer/cart/items', {
        method: 'POST',
        body: { productId, quantity },
      }),
    setQuantity: (productId: string, quantity: number) =>
      request<unknown>(`/customer/cart/items/${encodeURIComponent(productId)}`, {
        method: 'PATCH',
        body: { quantity },
      }),
    remove: (productId: string) =>
      request<{ removed: boolean }>(`/customer/cart/items/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
      }),
    clear: () => request<{ cleared: number }>('/customer/cart', { method: 'DELETE' }),
  },

  favorites: {
    list: (signal?: AbortSignal) => requestWithRetry<FavoriteResponse[]>('/customer/favorites', { signal }),
    add: (productId: string) =>
      request<FavoriteResponse>('/customer/favorites', { method: 'POST', body: { productId } }),
    remove: (productId: string) =>
      request<{ removed: boolean }>(`/customer/favorites/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
      }),
  },
};

// ----------------------------------------------------- consumer catalogue

/** A product as the public consumer catalogue returns it. */
export interface CatalogProduct {
  id: string;
  storeId: string;
  sku: string;
  /** Localised name, chosen by the `locale` the request carried. */
  name: string;
  nameEn: string;
  nameAr: string;
  type: string;
  unit: string;
  priceMinor: number;
  taxRateBp: number;
  /** A boolean, never a quantity: the catalogue does not expose stock depth. */
  available: boolean;
  imageUrl: string | null;
  store: { id: string; code: string; name: string };
}

/** A marketplace store, which is a tenant company with a published catalogue. */
export interface CatalogStore {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  nameAr: string;
  countryCode: string | null;
  productCount: number;
  providerId: string | null;
  categoryKey: string | null;
}

export interface CatalogCategory {
  key: string;
  name: string;
  icon: string | null;
  domain: string;
  imageUrl: string | null;
}

/**
 * The public consumer catalogue.
 *
 * Public by design: a guest browses parts and stores before signing in. Nothing
 * here returns a cost price or a stock quantity — the API selects the public
 * projection only, and the client has no field to display one.
 */
export const catalogApi = {
  products: (
    params: { locale: 'ar' | 'en'; companyId?: string; query?: string; sort?: string; page?: number; pageSize?: number } ,
    signal?: AbortSignal,
  ) => {
    const q = new URLSearchParams({ locale: params.locale });
    if (params.companyId) q.set('companyId', params.companyId);
    if (params.query) q.set('query', params.query);
    if (params.sort) q.set('sort', params.sort);
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    return requestWithRetry<{ items: CatalogProduct[]; total: number; page: number; pageSize: number }>(
      `/customer/catalog/products?${q}`,
      { auth: false, signal },
    );
  },

  product: (id: string, locale: 'ar' | 'en', signal?: AbortSignal) =>
    requestWithRetry<CatalogProduct & { images: Array<{ url: string | null }>; related: CatalogProduct[] }>(
      `/customer/catalog/products/${encodeURIComponent(id)}?locale=${locale}`,
      { auth: false, signal },
    ),

  stores: (params: { locale: 'ar' | 'en'; query?: string; sort?: 'name' | 'products' }, signal?: AbortSignal) => {
    const q = new URLSearchParams({ locale: params.locale });
    if (params.query) q.set('query', params.query);
    if (params.sort) q.set('sort', params.sort);
    return requestWithRetry<{ items: CatalogStore[]; total: number }>(`/customer/catalog/stores?${q}`, {
      auth: false,
      signal,
    });
  },

  store: (id: string, locale: 'ar' | 'en', signal?: AbortSignal) =>
    requestWithRetry<CatalogStore & { products: CatalogProduct[]; productTotal: number }>(
      `/customer/catalog/stores/${encodeURIComponent(id)}?locale=${locale}`,
      { auth: false, signal },
    ),

  categories: (locale: 'ar' | 'en', signal?: AbortSignal) =>
    requestWithRetry<{ items: CatalogCategory[]; total: number }>(
      `/customer/catalog/categories?locale=${locale}`,
      { auth: false, signal },
    ),

  /**
   * The live promotional offers published by approved providers.
   *
   * Public, like the rest of the catalogue. The API filters to active offers
   * inside their window, so the client shows exactly what is advertised.
   */
  offers: (params: { categoryKey?: string; limit?: number } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (params.categoryKey) q.set('categoryKey', params.categoryKey);
    if (params.limit) q.set('limit', String(params.limit));
    const suffix = q.toString() ? `?${q}` : '';
    return requestWithRetry<CatalogOffer[]>(`/customer/catalog/offers${suffix}`, { auth: false, signal });
  },
};

/** A promotional offer as the customer app receives it. */
export interface CatalogOffer {
  id: string;
  providerId: string;
  titleEn: string;
  titleAr: string;
  description: string | null;
  categoryKey: string | null;
  percentOffBp: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  provider: { id: string; code: string; nameEn: string; nameAr: string };
}

// -------------------------------------------------------- consumer orders

/** One line of a consumer order, as the API returns it. */
export interface OrderLine {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

/** The consumer order status machine, matching `CustomerOrderStatus`. */
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface OrderSummary {
  id: string;
  reference: string;
  status: OrderStatus;
  paymentMethod: string;
  subtotalMinor: number;
  taxMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  currency: string;
  placedAt: string;
  itemCount: number;
  lines: OrderLine[];
}

export interface OrderDetail extends OrderSummary {
  address: {
    label: string | null;
    line1: string;
    line2: string | null;
    city: string | null;
    countryCode: string | null;
  } | null;
  notes: string | null;
  cancellationReason: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  /** True while the server would still accept a cancellation. */
  cancellable: boolean;
  payment: { intentId: string; status: string; amountMinor: number; currency: string } | null;
  events: Array<{ status: OrderStatus; note: string | null; actor: string; createdAt: string }>;
}

/**
 * The consumer order surface.
 *
 * Every route resolves the account from the bearer token, so the client sends no
 * customer id and cannot address another account's order. The server computes
 * every total from the catalogue — the client only sends an address, a payment
 * method and an idempotency key.
 */
export const ordersApi = {
  list: (params: { page?: number; pageSize?: number; status?: string } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    if (params.status) q.set('status', params.status);
    return requestWithRetry<{ items: OrderSummary[]; total: number; page: number; pageSize: number }>(
      `/customer/orders?${q}`,
      { signal },
    );
  },

  get: (id: string, signal?: AbortSignal) =>
    requestWithRetry<OrderDetail>(`/customer/orders/${encodeURIComponent(id)}`, { signal }),

  /**
   * Place an order from the server cart.
   *
   * `idempotencyKey` is what makes a retried checkout safe: the same key returns
   * the order that was already placed rather than placing a second one. The
   * client generates it once per checkout attempt and reuses it on retry.
   */
  place: (input: { addressId?: string; paymentMethod?: string; notes?: string; idempotencyKey?: string }) =>
    request<OrderDetail>('/customer/orders', { method: 'POST', body: input }),

  cancel: (id: string, reason?: string) =>
    request<OrderDetail>(`/customer/orders/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: reason ? { reason } : {},
    }),
};

// ---------------------------------------------------- customer addresses

/** A delivery address, as `GET /customer/addresses` returns it. */
export interface CustomerAddress {
  id: string;
  accountId: string;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  area: string | null;
  countryCode: string | null;
  postalCode: string | null;
  isDefault: boolean;
}

/**
 * The customer's own delivery addresses.
 *
 * Every route resolves the account from the bearer token, so no account id is
 * ever sent and one customer cannot read or edit another's addresses.
 */
export const addressesApi = {
  list: (signal?: AbortSignal) =>
    requestWithRetry<CustomerAddress[]>('/customer/addresses', { signal }),

  create: (input: {
    label?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    area?: string;
    countryCode?: string;
    postalCode?: string;
    isDefault?: boolean;
  }) => request<CustomerAddress>('/customer/addresses', { method: 'POST', body: input }),

  update: (id: string, patch: Partial<Omit<CustomerAddress, 'id' | 'accountId'>>) =>
    request<CustomerAddress>(`/customer/addresses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
    }),

  remove: (id: string) =>
    request<void>(`/customer/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ------------------------------------------------------ customer payments

/** One payment intent in the customer's own history. */
export interface CustomerPayment {
  id: string;
  intentNumber: string;
  targetType: string;
  targetId: string;
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

/**
 * The customer's payment history.
 *
 * Read-only by design: money is never created from this screen, so there is no
 * top-up route. An intent is raised by the obligation being paid (an invoice or a
 * booking), which keeps every amount tied to a real document.
 */
export const paymentsApi = {
  history: (params: { page?: number; pageSize?: number } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    return requestWithRetry<{ items: CustomerPayment[]; total: number }>(
      `/customer/payments?${q}`,
      { signal },
    );
  },
};

// -------------------------------------------------- customer notifications

/** One in-app notification, as `GET /customer/notifications` returns it. */
export interface CustomerNotification {
  id: string;
  category: string;
  subject: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

/**
 * The customer's own in-app notifications.
 *
 * Every route resolves the account from the bearer token, so a customer cannot
 * read or mark read another account's notifications. Delivery diagnostics for
 * operators live on the staff plane and are not reachable from here.
 */
export const notificationsApi = {
  list: (params: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 50));
    if (params.unreadOnly) q.set('unreadOnly', 'true');
    return requestWithRetry<{ items: CustomerNotification[]; total: number; unread: number }>(
      `/customer/notifications?${q}`,
      { signal },
    );
  },

  markRead: (ids: string[]) =>
    request<{ updated: number }>('/customer/notifications/read', { method: 'POST', body: { ids } }),

  markAllRead: () => request<{ updated: number }>('/customer/notifications/read-all', { method: 'POST' }),
};

// -------------------------------------------------- public marketplace

/** An active listing on a provider, as the public marketplace returns it. */
export interface PublicProviderListing {
  id: string;
  categoryKey: string;
  nameEn: string;
  nameAr: string;
  priceMinor: number;
  currency: string;
}

/**
 * An approved service provider, as `GET /marketplace/providers` returns it.
 *
 * The directory aggregates the rating server-side from published reviews only,
 * so `averageRating` is null until a review has been moderated in — the card
 * draws no pill in that case rather than a zero.
 */
export interface PublicProvider {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  categoryKey: string | null;
  phone: string | null;
  email: string | null;
  listings: PublicProviderListing[];
  reviewCount: number;
  averageRating: number | null;
}

/** One published review on a provider profile. */
export interface PublicProviderReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  providerReply: string | null;
  createdAt: string;
}

/** A provider profile with its listings, working hours and published reviews. */
export interface PublicProviderDetail extends Omit<PublicProvider, 'listings'> {
  listings: PublicProviderListing[];
  availability: Array<{
    id: string;
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
    isClosed: boolean;
  }>;
  reviews: PublicProviderReview[];
}

/**
 * The public service marketplace.
 *
 * No token: a guest browses providers and their published prices before signing
 * in. Only `APPROVED` providers with `isActive` listings are returned, so a
 * pending or suspended provider cannot appear in the app.
 */
export const marketplaceApi = {
  providers: (
    params: { categoryKey?: string; page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ) => {
    const q = new URLSearchParams();
    if (params.categoryKey) q.set('categoryKey', params.categoryKey);
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    return requestWithRetry<{ items: PublicProvider[]; total: number }>(`/marketplace/providers?${q}`, {
      auth: false,
      signal,
    });
  },

  provider: (id: string, signal?: AbortSignal) =>
    requestWithRetry<PublicProviderDetail>(`/marketplace/providers/${encodeURIComponent(id)}`, {
      auth: false,
      signal,
    }),
};

/**
 * One service request as the customer's own list returns it.
 *
 * The record carries the provider once one has accepted it, so the app can show
 * who is coming without a second call. `reviews` is the moderation state of the
 * customer's own review, used to decide whether the "leave a review" action is
 * still offered.
 */
export interface CustomerServiceRequest {
  id: string;
  requestNumber: string;
  categoryKey: string;
  description: string | null;
  status: string;
  createdAt: string;
  providerId: string | null;
  provider: { id: string; nameEn: string; nameAr: string; phone: string | null } | null;
  reviews: Array<{ id: string; rating: number; status: string }>;
}

/**
 * The customer's own service requests.
 *
 * A service request is how a recovery, a wash or a repair is raised when it is
 * not tied to a bookable slot. The account is resolved from the bearer token, so
 * the client sends no account id and cannot read another customer's requests.
 */
export const serviceRequestsApi = {
  list: (params: { page?: number; pageSize?: number } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 50));
    return requestWithRetry<{ items: CustomerServiceRequest[]; total: number }>(
      `/customer/marketplace/requests?${q}`,
      { signal },
    );
  },

  create: (input: { categoryKey: string; description?: string; vehicleId?: string; companyId?: string }) =>
    request<CustomerServiceRequest>('/customer/marketplace/requests', { method: 'POST', body: input }),

  cancel: (id: string, reason: string) =>
    request<CustomerServiceRequest>(`/customer/marketplace/requests/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
};

// ------------------------------------------------------- auth and bookings

export interface CustomerSession {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  account: {
    id: string;
    email: string;
    fullName: string;
    preferredLocale: 'ar' | 'en';
    preferredTheme: 'dark' | 'light';
    defaultCompanyId: string | null;
  };
}

export interface BookingSummary {
  id: string;
  reference?: string;
  bookingType: string;
  status: string;
  startsAt: string;
  endsAt?: string;
  durationMinutes?: number;
  serviceRef?: string | null;
  resourceId?: string | null;
  notes?: string | null;
  /** Present on a held booking; the instant the hold is released if unconfirmed. */
  holdExpiresAt?: string | null;
  cancellationReason?: string | null;
  /** Present on `GET /customer/bookings/:id`; absent from the list projection. */
  resource?: { id: string; code: string; nameEn: string; nameAr: string } | null;
  branch?: { id: string; code: string; nameEn: string; nameAr: string; phone?: string | null } | null;
}

/** A bookable slot as `GET /customer/bookings/availability` returns it. */
export interface AvailabilitySlot {
  /** ISO instant. */
  startsAt: string;
  endsAt: string;
  /** Minutes from the local midnight the day was planned from. */
  startMinute: number;
  endMinute: number;
}

/** The account endpoints, matching `CustomerAuthController`. */
export const authApi = {
  register: (email: string, password: string, fullName: string, preferredLocale: 'ar' | 'en' = 'ar', phone?: string) =>
    request<CustomerSession>('/customer/auth/register', {
      method: 'POST',
      auth: false,
      body: phone ? { email, password, fullName, preferredLocale, phone } : { email, password, fullName, preferredLocale },
    }),

  login: (email: string, password: string) =>
    request<CustomerSession>('/customer/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
    }),

  /** Rotates the session. The refresh token is presented in the body for a native client. */
  refresh: (refreshToken: string) =>
    request<CustomerSession>('/customer/auth/refresh', {
      method: 'POST',
      auth: false,
      body: { refreshToken },
    }),

  me: (signal?: AbortSignal) => request<CustomerSession['account']>('/customer/auth/me', { signal }),

  /**
   * Request a password reset.
   *
   * The server answers `{ requested: true }` whether or not the address is
   * registered, so this endpoint cannot be used to enumerate accounts. Outside
   * production it also returns the reset token because no email provider is
   * configured; the screen passes that straight through so the flow is testable
   * without a mailbox.
   */
  forgotPassword: (email: string) =>
    request<{ requested: boolean; resetToken?: string }>('/customer/auth/forgot-password', {
      method: 'POST',
      auth: false,
      body: { email },
    }),

  /** Complete a password reset with the token from the email. */
  resetPassword: (token: string, password: string) =>
    request<{ reset: boolean }>('/customer/auth/reset-password', {
      method: 'POST',
      auth: false,
      body: { token, password },
    }),

  /**
   * Update the signed-in customer's own profile.
   *
   * The API scopes this to the token's account, so the client sends no account
   * id and cannot edit another customer's profile.
   */
  updateProfile: (patch: { fullName?: string; phone?: string; preferredLocale?: 'ar' | 'en' }) =>
    request<CustomerSession['account']>('/customer/auth/profile', { method: 'POST', body: patch }),

  /** Change the password of the signed-in customer. The server verifies the current one. */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: boolean }>('/customer/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  /** Revoke every other device's session. */
  logoutAll: () =>
    request<{ revoked: number }>('/customer/auth/logout-all', { method: 'POST' }),

  /**
   * Revokes the session server-side, then the caller clears local state.
   *
   * The refresh token must travel in the body: a native client holds no cookie,
   * so without it the API has nothing to revoke and the token stays usable until
   * it expires. The stored token is supplied by the session layer.
   */
  logout: (refreshToken?: string) =>
    request<void>('/customer/auth/logout', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
    }),
};

/**
 * The staff sign-in, used by the merchant/provider side.
 *
 * A provider user is a staff account, not a consumer account: a provider
 * operates a business and must be subject to the staff audit and session rules.
 * The refresh token is requested in the body because the device has no cookie
 * jar, exactly as the consumer client does.
 */
export interface StaffSession {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    fullNameEn: string;
    fullNameAr: string;
    isSuperAdmin: boolean;
  };
  memberships?: Array<{
    companyId: string;
    companyNameEn?: string;
    companyNameAr?: string;
    roleId?: string;
    roleNameEn?: string;
    roleNameAr?: string;
  }>;
}

export const staffAuthApi = {
  login: (email: string, password: string) =>
    request<StaffSession>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
    }),

  refresh: (refreshToken: string) =>
    request<StaffSession>('/auth/refresh', {
      method: 'POST',
      auth: false,
      body: { refreshToken },
    }),

  me: (signal?: AbortSignal) => request<StaffSession['user']>('/auth/me', { signal }),

  /** Same reason as the customer logout: a native client has no cookie to revoke. */
  logout: (refreshToken?: string) =>
    request<void>('/auth/logout', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
      plane: 'staff',
    }),
};

/** The customer booking endpoints, matching `CustomerBookingController`. */
export const bookingsApi = {
  availability: (params: { date: string; durationMinutes?: number; serviceRef?: string }, signal?: AbortSignal) => {
    const q = new URLSearchParams({ date: params.date });
    if (params.durationMinutes) q.set('durationMinutes', String(params.durationMinutes));
    if (params.serviceRef) q.set('serviceRef', params.serviceRef);
    return requestWithRetry<AvailabilitySlot[]>(`/customer/bookings/availability?${q}`, { signal });
  },

  create: (input: {
    bookingType: string;
    startsAt: string;
    durationMinutes: number;
    vehicleId?: string;
    serviceRef?: string;
    resourceId?: string;
    notes?: string;
  }) => request<BookingSummary>('/customer/bookings', { method: 'POST', body: input }),

  list: (page = 1, pageSize = 20, signal?: AbortSignal) =>
    requestWithRetry<{ items: BookingSummary[]; total?: number }>(
      `/customer/bookings?page=${page}&pageSize=${pageSize}`,
      { signal },
    ),

  get: (id: string, signal?: AbortSignal) =>
    requestWithRetry<BookingSummary>(`/customer/bookings/${encodeURIComponent(id)}`, { signal }),

  /**
   * Confirm a held booking.
   *
   * A customer booking is created as a hold, so it must be confirmed within the
   * hold window or it is released. Confirmation is a customer-owned operation:
   * the API resolves the booking from the caller's account, never from the id.
   */
  confirm: (id: string) =>
    request<BookingSummary>(`/customer/bookings/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
    }),

  cancel: (id: string, reason?: string) =>
    request<BookingSummary>(`/customer/bookings/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
};

/** Whether a refresh token is stored, so a screen knows if a session could be resumed. */
export async function hasStoredSession(): Promise<boolean> {
  return (await getSecret(SESSION_KEY)) !== null;
}

// ------------------------------------------------------------- uploads

/**
 * A file to upload, as the picker hands it over.
 *
 * `uri` is a local file path on the device. On native it is passed straight to
 * `fetch` as a blob part; in the web preview it is a `blob:` URL that `fetch`
 * can also read.
 */
export interface UploadFile {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 * Uploads a file as `multipart/form-data`.
 *
 * Deliberately separate from `request`: a multipart body must not set a JSON
 * `Content-Type`, the platform has to set the boundary itself, and an upload is
 * long enough that the default timeout is too short. Retries are never
 * automatic — a retried upload could attach the same image twice — so the caller
 * decides whether to try again.
 */
export async function uploadFile<T>(
  path: string,
  file: UploadFile,
  fields: Record<string, string> = {},
  options: { timeoutMs?: number; signal?: AbortSignal; plane?: 'customer' | 'staff' } = {},
): Promise<T> {
  if (isOffline()) throw new ApiError('offline', null, 'No internet connection');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  // React Native's FormData accepts a `{ uri, name, type }` part; the web
  // `FormData` accepts a Blob, so the file is fetched into one first.
  if (typeof (globalThis as { document?: unknown }).document !== 'undefined') {
    const blob = await (await fetch(file.uri)).blob();
    form.append('file', blob, file.name);
  } else {
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as never);
  }

  const headers: Record<string, string> = { Accept: 'application/json', 'x-oryx-client': 'mobile' };
  const token = options.plane === 'staff' ? staffAccessToken : accessToken;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${V1}${path}`, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) throw await toError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      if (options.signal?.aborted) throw new ApiError('unknown', null, 'Upload cancelled');
      throw new ApiError('timeout', null, 'The upload took too long');
    }
    throw new ApiError('offline', null, 'Could not reach the server');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** A stock item as `GET /inventory/products` returns it. */
export interface InventoryProduct {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  type: string;
  unit: string;
  barcode: string | null;
  salesPriceMinor: number;
  costPriceMinor: number;
  reorderLevel: number;
  reorderQuantity: number;
  trackStock: boolean;
  isActive: boolean;
}

/**
 * The company's stock catalogue.
 *
 * Staff-plane routes: the API resolves the tenant from the bearer token, so the
 * client never sends a company id and cannot read another tenant's catalogue.
 * The merchant screens use this to list products and to attach photographs.
 */
export const inventoryApi = {
  products: (params: { search?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 200));
    return requestWithRetry<{ items: InventoryProduct[]; total: number; page: number; pageSize: number }>(
      `/inventory/products?${q}`,
      { signal, plane: 'staff' },
    );
  },

  createProduct: (input: {
    sku: string;
    nameEn: string;
    nameAr: string;
    type?: 'PRODUCT' | 'SERVICE';
    salesPriceMinor?: number;
    costPriceMinor?: number;
  }) => request<InventoryProduct>('/inventory/products', { method: 'POST', body: input, plane: 'staff' }),

  updateProduct: (id: string, patch: Partial<{ nameEn: string; nameAr: string; salesPriceMinor: number; costPriceMinor: number; isActive: boolean }>) =>
    request<InventoryProduct>(`/inventory/products/${id}`, { method: 'PATCH', body: patch, plane: 'staff' }),
};

/** A product image as the catalogue API returns it. */
export interface ProductImage {
  id: string;
  productId: string;
  url: string | null;
  altEn: string | null;
  altAr: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

/** An inspection photo as the customer API returns it. */
export interface InspectionPhoto {
  id: string;
  vehicleId: string | null;
  url: string | null;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  caption: string | null;
  createdAt: string;
}

/** Product photography. Company-scoped: the API resolves the tenant from the token. */
export const productImagesApi = {
  list: (productId: string, signal?: AbortSignal) =>
    requestWithRetry<ProductImage[]>(`/inventory/products/${productId}/images`, { signal, plane: 'staff' }),

  upload: (
    productId: string,
    file: UploadFile,
    fields: { altEn?: string; altAr?: string; isPrimary?: boolean } = {},
  ) => {
    const body: Record<string, string> = {};
    if (fields.altEn) body.altEn = fields.altEn;
    if (fields.altAr) body.altAr = fields.altAr;
    if (fields.isPrimary !== undefined) body.isPrimary = String(fields.isPrimary);
    return uploadFile<ProductImage>(`/inventory/products/${productId}/images`, file, body, { plane: 'staff' });
  },

  update: (productId: string, imageId: string, patch: Partial<Pick<ProductImage, 'altEn' | 'altAr' | 'sortOrder' | 'isPrimary'>>) =>
    request<ProductImage>(`/inventory/products/${productId}/images/${imageId}`, {
      method: 'PATCH',
      body: patch,
      plane: 'staff',
    }),

  remove: (productId: string, imageId: string) =>
    request<{ removed: boolean }>(`/inventory/products/${productId}/images/${imageId}`, {
      method: 'DELETE',
      plane: 'staff',
    }),
};

/** SENSAGE inspection photographs. Ownership is enforced from the bearer token. */
export const inspectionPhotosApi = {
  list: (vehicleId?: string, signal?: AbortSignal) =>
    requestWithRetry<InspectionPhoto[]>(
      `/customer/inspection-photos${vehicleId ? `?vehicleId=${encodeURIComponent(vehicleId)}` : ''}`,
      { signal },
    ),

  upload: (file: UploadFile, fields: { vehicleId?: string; caption?: string } = {}) => {
    const body: Record<string, string> = {};
    if (fields.vehicleId) body.vehicleId = fields.vehicleId;
    if (fields.caption) body.caption = fields.caption;
    return uploadFile<InspectionPhoto>('/customer/inspection-photos', file, body);
  },

  remove: (id: string) =>
    request<{ removed: boolean }>(`/customer/inspection-photos/${id}`, { method: 'DELETE' }),
};

/** A vehicle in the customer's own garage, as the API returns it. */
export interface CustomerVehicle {
  id: string;
  vin: string;
  plateNumber: string | null;
  make: string;
  model: string;
  modelYear: number;
  color: string | null;
  mileage: number | null;
}

/**
 * The customer's own garage.
 *
 * Every route resolves the account from the bearer token, so the client never
 * sends an account id and cannot address another customer's vehicle.
 */
export const vehiclesApi = {
  list: (signal?: AbortSignal) =>
    requestWithRetry<CustomerVehicle[]>('/customer/vehicles', { signal }),

  create: (input: {
    vin: string;
    plateNumber?: string;
    make: string;
    model: string;
    modelYear: number;
    color?: string;
    mileage?: number;
    notes?: string;
  }) => request<CustomerVehicle>('/customer/vehicles', { method: 'POST', body: input }),

  update: (
    id: string,
    patch: Partial<{ plateNumber: string; color: string; mileage: number; notes: string }>,
  ) => request<CustomerVehicle>(`/customer/vehicles/${id}`, { method: 'PATCH', body: patch }),

  remove: (id: string) =>
    request<{ removed: boolean }>(`/customer/vehicles/${id}`, { method: 'DELETE' }),

  history: (id: string, signal?: AbortSignal) =>
    requestWithRetry<CustomerVehicleHistory>(
      `/customer/vehicles/${encodeURIComponent(id)}/history`,
      { signal },
    ),
};

/**
 * One vehicle's full service history, assembled server-side from the ERP.
 *
 * Inspections, maintenance bookings, workshop job cards and warranties are
 * separate record types in the platform, so they arrive as four lists rather than
 * one invented timeline. The screen shows each under its own heading, which keeps
 * a real inspection distinct from a real job card.
 */
export interface CustomerVehicleHistory {
  vehicle: { id: string; vin: string; make: string; model: string; modelYear: number };
  inspections: Array<{
    id: string;
    bookingNumber: string;
    status: string;
    scheduledAt: string | null;
    createdAt: string;
  }>;
  maintenance: Array<{
    id: string;
    bookingNumber: string;
    status: string;
    scheduledAt: string | null;
    complaint: string | null;
    createdAt: string;
  }>;
  jobCards: Array<{
    id: string;
    jobNumber: string;
    status: string;
    complaint: string | null;
    odometer: number | null;
    completedAt: string | null;
    createdAt: string;
  }>;
  warranties: Array<{
    id: string;
    description: string;
    isActive: boolean;
    startsAt: string;
    expiresAt: string;
  }>;
}

/**
 * Turns a media reference from the API into an absolute URL the `<Image>` can load.
 *
 * The API returns paths (`/api/v1/cms/media/…/file?variant=card`), not absolute
 * URLs, so the device would otherwise try to load them from its own origin. This
 * resolves them against the API base.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  // `BASE_URL` already includes `/api`; the returned path starts with `/api/v1`.
  const origin = BASE_URL.replace(/\/api$/, '');
  return `${origin}${path}`;
}

// ---------------------------------------------------------- provider portal

/** A provider profile as `GET /provider/profile` returns it. */
export interface ProviderProfile {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  categoryKey: string;
  phone: string | null;
  email: string | null;
  status: string;
  commissionPercentBp: number;
}

/** A service listing as `GET /provider/listings` returns it. */
export interface ProviderListing {
  id: string;
  providerId: string;
  categoryKey: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  isActive: boolean;
}

/** A promotional offer published by a provider, as the portal returns it. */
export interface ProviderOffer {
  id: string;
  providerId: string;
  titleEn: string;
  titleAr: string;
  description: string | null;
  categoryKey: string | null;
  percentOffBp: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A service request offered to or assigned to the provider. */
export interface ProviderRequest {
  id: string;
  requestNumber: string;
  categoryKey: string;
  description: string | null;
  status: string;
  createdAt: string;
  assignedAt: string | null;
  completedAt: string | null;
}

/** The provider earnings summary, as `GET /provider/earnings` returns it. */
export interface ProviderEarnings {
  pending: { count: number; grossMinor: number; commissionMinor: number };
  awaitingPayment: { count: number; netMinor: number };
  paidToDate: { count: number; netMinor: number };
}

/**
 * The merchant/provider portal.
 *
 * These routes are staff routes: the provider user is a staff account linked to
 * a `MarketplaceProvider` through `ProviderUser`, not a consumer account. The
 * API resolves the provider from that membership, never from the URL, so a
 * provider user cannot read or act on another provider's work. The mobile client
 * sends no provider id, which is what makes that isolation unbypassable here.
 *
 * Every call carries the staff token (`plane: 'staff'`), because a consumer token
 * would be refused by the staff guards — correctly so.
 */
/** A subscription plan as the plans catalogue returns it. */
export interface SubscriptionPlan {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  isActive: boolean;
  trialDays: number;
  maxBranches: number;
  maxUsers: number;
  modules: Array<{ moduleKey: string; nameEn: string; nameAr: string; group: string }>;
  subscriberCount?: number;
}

/** The tenant's own subscription, as the API resolves it from the token. */
export interface CompanySubscription {
  id: string;
  companyId: string;
  planId: string;
  planNameEn: string;
  planNameAr: string;
  status: string;
  billingPeriod: string;
  price: number;
  currency: string;
  startedAt: string;
  currentPeriodEnd: string | null;
  licensedModules: string[];
}

/**
 * The plan catalogue and the tenant's own subscription, both on the staff plane.
 *
 * `plans()` needs `company.subscription.read`, which every company administrator
 * holds. `current()` returns only the caller's company subscription: the API
 * scopes the query from the token's company, so no company id is sent and
 * another tenant's billing cannot be read.
 */
export const subscriptionApi = {
  plans: (signal?: AbortSignal) =>
    requestWithRetry<SubscriptionPlan[]>('/plans?includeInactive=false', { signal, plane: 'staff' }),

  current: (signal?: AbortSignal) =>
    requestWithRetry<CompanySubscription[]>('/subscriptions', { signal, plane: 'staff' }),
};

export const providerApi = {
  profile: (signal?: AbortSignal) =>
    requestWithRetry<ProviderProfile>('/provider/profile', { signal, plane: 'staff' }),

  updateProfile: (patch: { nameEn?: string; nameAr?: string; phone?: string; email?: string }) =>
    request<ProviderProfile>('/provider/profile', { method: 'PATCH', body: patch, plane: 'staff' }),

  listings: (signal?: AbortSignal) =>
    requestWithRetry<ProviderListing[]>('/provider/listings', { signal, plane: 'staff' }),

  createListing: (input: {
    categoryKey: string;
    nameEn: string;
    nameAr: string;
    description?: string;
    priceMinor: number;
    currency?: string;
  }) => request<ProviderListing>('/provider/listings', { method: 'POST', body: input, plane: 'staff' }),

  updateListing: (
    id: string,
    patch: Partial<{
      nameEn: string;
      nameAr: string;
      description: string;
      priceMinor: number;
      isActive: boolean;
    }>,
  ) => request<ProviderListing>(`/provider/listings/${id}`, { method: 'PATCH', body: patch, plane: 'staff' }),

  requests: (params: { status?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    return requestWithRetry<{ items: ProviderRequest[]; total?: number }>(`/provider/requests?${q}`, {
      signal,
      plane: 'staff',
    });
  },

  acceptRequest: (id: string) =>
    request<ProviderRequest>(`/provider/requests/${id}/accept`, { method: 'POST', plane: 'staff' }),
  declineRequest: (id: string, reason?: string) =>
    request<ProviderRequest>(`/provider/requests/${id}/decline`, { method: 'POST', body: { reason }, plane: 'staff' }),
  startRequest: (id: string) =>
    request<ProviderRequest>(`/provider/requests/${id}/start`, { method: 'POST', plane: 'staff' }),
  completeRequest: (id: string, input: { finalAmountMinor: number; currency?: string }) =>
    request<ProviderRequest>(`/provider/requests/${id}/complete`, { method: 'POST', body: input, plane: 'staff' }),
  cancelRequest: (id: string, reason?: string) =>
    request<ProviderRequest>(`/provider/requests/${id}/cancel`, { method: 'POST', body: { reason }, plane: 'staff' }),

  offers: (params: { includeInactive?: boolean } = {}, signal?: AbortSignal) => {
    const q = params.includeInactive ? '?includeInactive=true' : '';
    return requestWithRetry<ProviderOffer[]>(`/provider/offers${q}`, { signal, plane: 'staff' });
  },

  createOffer: (input: {
    titleEn: string;
    titleAr: string;
    description?: string;
    categoryKey?: string;
    percentOffBp: number;
    startsAt?: string;
    endsAt?: string;
  }) => request<ProviderOffer>('/provider/offers', { method: 'POST', body: input, plane: 'staff' }),

  updateOffer: (
    id: string,
    patch: Partial<{
      titleEn: string;
      titleAr: string;
      description: string;
      categoryKey: string;
      percentOffBp: number;
      isActive: boolean;
      startsAt: string;
      endsAt: string;
    }>,
  ) => request<ProviderOffer>(`/provider/offers/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, plane: 'staff' }),

  earnings: (signal?: AbortSignal) =>
    requestWithRetry<ProviderEarnings>('/provider/earnings', { signal, plane: 'staff' }),
  settlements: (signal?: AbortSignal) =>
    requestWithRetry<unknown[]>('/provider/settlements', { signal, plane: 'staff' }),
  reviews: (signal?: AbortSignal) => requestWithRetry<unknown[]>('/provider/reviews', { signal, plane: 'staff' }),

  /**
   * Consumer orders placed against the provider's own company.
   *
   * The API resolves the provider — and therefore the company — from the
   * authenticated user's `ProviderUser` membership, never from the URL. The
   * client sends no company id, so a merchant cannot read another tenant's
   * orders even by editing the request.
   */
  orders: (params: { status?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    return requestWithRetry<{ items: Array<OrderSummary & { customerAccountId: string }>; total: number }>(
      `/provider/orders?${q}`,
      { signal, plane: 'staff' },
    );
  },

  order: (id: string, signal?: AbortSignal) =>
    requestWithRetry<OrderDetail & { customerAccountId: string }>(
      `/provider/orders/${encodeURIComponent(id)}`,
      { signal, plane: 'staff' },
    ),

  setOrderStatus: (id: string, status: OrderStatus, note?: string) =>
    request<OrderDetail>(`/provider/orders/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: note ? { status, note } : { status },
      plane: 'staff',
    }),
};
