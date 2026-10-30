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
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
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
  const { method = 'GET', body, auth = true, timeoutMs = TIMEOUT_MS, signal } = options;

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
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

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
}

export interface AvailabilitySlot {
  startsAt: string;
  endsAt?: string;
  resourceId?: string;
  available?: boolean;
}

/** The account endpoints, matching `CustomerAuthController`. */
export const authApi = {
  register: (email: string, password: string, fullName: string, preferredLocale: 'ar' | 'en' = 'ar') =>
    request<CustomerSession>('/customer/auth/register', {
      method: 'POST',
      auth: false,
      body: { email, password, fullName, preferredLocale },
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

  logout: () => request<void>('/customer/auth/logout', { method: 'POST' }),
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
