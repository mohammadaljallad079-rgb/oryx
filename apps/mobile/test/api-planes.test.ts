import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  authApi,
  bookingsApi,
  getAccessToken,
  getStaffAccessToken,
  inventoryApi,
  mediaUrl,
  productImagesApi,
  request,
  setAccessToken,
  setStaffAccessToken,
  staffAuthApi,
  uploadFile,
} from '../src/lib/api';

/**
 * The API client's identity-plane separation.
 *
 * The server refuses a consumer token on a staff route and the reverse, so the
 * client must keep the two tokens in separate slots. These tests pin that: a
 * request on the staff plane sends the staff token and never the consumer one,
 * and vice versa. A regression here would surface in the app as a confusing 401
 * on whichever screen happened to run second.
 */

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  setItemAsync: vi.fn(async () => undefined),
  getItemAsync: vi.fn(async () => null),
  deleteItemAsync: vi.fn(async () => undefined),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let captured: Captured[] = [];

function stubFetch(status = 200, payload: unknown = { ok: true }) {
  captured = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    captured.push({
      url,
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body,
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

afterEach(() => {
  setAccessToken(null);
  setStaffAccessToken(null);
  vi.unstubAllGlobals();
});

describe('identity planes', () => {
  it('sends the consumer token by default', async () => {
    stubFetch();
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await request('/customer/bookings');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
  });

  it('sends the staff token when the staff plane is requested', async () => {
    stubFetch();
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await request('/provider/profile', { plane: 'staff' });
    expect(captured[0]?.headers.Authorization).toBe('Bearer staff-token');
  });

  it('does not leak the consumer token onto a staff request', async () => {
    stubFetch();
    setAccessToken('consumer-token');
    setStaffAccessToken(null);
    await request('/provider/profile', { plane: 'staff' });
    expect(captured[0]?.headers.Authorization).toBeUndefined();
  });

  it('keeps the two tokens independent', () => {
    setAccessToken('a');
    setStaffAccessToken('b');
    expect(getAccessToken()).toBe('a');
    expect(getStaffAccessToken()).toBe('b');
    setStaffAccessToken(null);
    expect(getAccessToken()).toBe('a');
    expect(getStaffAccessToken()).toBeNull();
  });
});

describe('request behaviour', () => {
  it('classifies a 401 as unauthorized', async () => {
    stubFetch(401, { message: 'nope' });
    await expect(request('/customer/bookings')).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
    });
  });

  it('classifies a 403 as forbidden', async () => {
    stubFetch(403, { message: 'no' });
    const err = await request('/provider/profile', { plane: 'staff' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe('forbidden');
  });

  it('always advertises the mobile client header', async () => {
    stubFetch();
    await request('/home');
    expect(captured[0]?.headers['x-oryx-client']).toBe('mobile');
  });
});

describe('uploadFile', () => {
  it('sends multipart form data with the staff token on the staff plane', async () => {
    stubFetch(201, { id: 'img-1' });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    // The web branch fetches the file into a Blob; jsdom/undici provide a
    // global fetch that returns a Response we can turn into a Blob.
    await uploadFile('/inventory/products/p1/images', {
      uri: 'data:text/plain;base64,aGVsbG8=',
      name: 'a.jpg',
      mimeType: 'image/jpeg',
    }, {}, { plane: 'staff' });
    expect(captured[0]?.headers.Authorization).toBe('Bearer staff-token');
  });
});

describe('inventory plane separation', () => {
  it('lists products on the staff plane, never the consumer token', async () => {
    stubFetch(200, { items: [], total: 0, page: 1, pageSize: 200 });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await inventoryApi.products();
    expect(captured[0]?.url).toContain('/inventory/products');
    expect(captured[0]?.headers.Authorization).toBe('Bearer staff-token');
  });

  it('uploads a product image on the staff plane', async () => {
    stubFetch(201, { id: 'img-1' });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await productImagesApi.upload('p1', { uri: 'data:text/plain;base64,aGVsbG8=', name: 'a.jpg', mimeType: 'image/jpeg' });
    expect(captured[0]?.url).toContain('/inventory/products/p1/images');
    expect(captured[0]?.headers.Authorization).toBe('Bearer staff-token');
  });
});

describe('logout revokes the presented session', () => {
  // A native client holds no cookie, so the refresh token must travel in the
  // body. Sending an empty body leaves the token valid until it expires, which
  // is a real sign-out failure rather than a cosmetic one.
  it('sends the consumer refresh token in the logout body', async () => {
    stubFetch(200, { ok: true });
    await authApi.logout('consumer-refresh-token');
    expect(captured[0]?.url).toContain('/customer/auth/logout');
    expect(captured[0]?.method).toBe('POST');
    expect(JSON.parse(captured[0]?.body as string)).toEqual({ refreshToken: 'consumer-refresh-token' });
  });

  it('sends the staff refresh token on the staff plane', async () => {
    stubFetch(200, { ok: true });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await staffAuthApi.logout('staff-refresh-token');
    expect(captured[0]?.url).toContain('/auth/logout');
    expect(captured[0]?.headers.Authorization).toBe('Bearer staff-token');
    expect(JSON.parse(captured[0]?.body as string)).toEqual({ refreshToken: 'staff-refresh-token' });
  });
});

describe('booking lifecycle calls', () => {
  // A customer booking is created as a hold, so the client must confirm it or
  // the slot is released. These pin the two calls the wizard and the detail
  // screen make, and that the confirm is a customer-plane POST by id.
  it('confirms a booking on the consumer plane', async () => {
    stubFetch(200, { id: 'bk-1', status: 'CONFIRMED' });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await bookingsApi.confirm('bk-1');
    expect(captured[0]?.url).toContain('/customer/bookings/bk-1/confirm');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
  });

  it('reads a single booking by id', async () => {
    stubFetch(200, { id: 'bk-2', status: 'HELD' });
    await bookingsApi.get('bk-2');
    expect(captured[0]?.url).toContain('/customer/bookings/bk-2');
    expect(captured[0]?.method).toBe('GET');
  });

  it('url-encodes the booking id on the confirm path', async () => {
    stubFetch(200, { id: 'a/b', status: 'CONFIRMED' });
    await bookingsApi.confirm('a/b');
    expect(captured[0]?.url).toContain('/customer/bookings/a%2Fb/confirm');
  });
});

describe('mediaUrl', () => {
  it('leaves an absolute URL untouched', () => {
    expect(mediaUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });

  it('resolves a relative media path against the API origin', () => {
    const url = mediaUrl('/api/v1/cms/media/abc/file?variant=card');
    expect(url).toMatch(/\/api\/v1\/cms\/media\/abc\/file\?variant=card$/);
    expect(url?.startsWith('http')).toBe(true);
  });

  it('returns null for an empty reference', () => {
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
    expect(mediaUrl('')).toBeNull();
  });
});
