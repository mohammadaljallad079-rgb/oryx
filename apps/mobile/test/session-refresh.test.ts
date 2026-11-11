import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  canRefreshSession,
  getAccessToken,
  request,
  setAccessToken,
  uploadFile,
  setSessionExpiredHandler,
  setSessionRefresher,
} from '../src/lib/api';

/**
 * Mid-session access-token expiry.
 *
 * An access token is deliberately short-lived, so the common expiry is *during*
 * a session, not at start-up. Before this, a 401 on an ordinary request (cancel
 * a booking, save a vehicle) simply failed and the customer had to restart the
 * app to reach the cold-start restore path. The client now rotates once and
 * replays the request, and tells the session store to drop the session when the
 * rotation itself is refused.
 */

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  setItemAsync: vi.fn(async () => undefined),
  getItemAsync: vi.fn(async () => null),
  deleteItemAsync: vi.fn(async () => undefined),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

interface Call {
  url: string;
  headers: Record<string, string>;
}

let calls: Call[] = [];

/** A stub that answers each queued status in order, then 200 for the rest. */
function stubSequence(statuses: number[], payload: unknown = { ok: true }) {
  calls = [];
  let index = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const status = statuses[index] ?? 200;
    index += 1;
    calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
    return new Response(JSON.stringify(status >= 400 ? { message: 'expired' } : payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

afterEach(() => {
  setAccessToken(null);
  setSessionRefresher('customer', null);
  setSessionRefresher('staff', null);
  setSessionExpiredHandler('customer', null);
  setSessionExpiredHandler('staff', null);
  vi.unstubAllGlobals();
});

describe('session refresh on a mid-session 401', () => {
  beforeEach(() => {
    setAccessToken('stale-token');
  });

  it('has no refresher until a session store registers one', () => {
    expect(canRefreshSession('customer')).toBe(false);
    expect(canRefreshSession('staff')).toBe(false);
  });

  it('rotates once and replays the request when the refresh succeeds', async () => {
    const refresher = vi.fn(async () => {
      setAccessToken('fresh-token');
      return true;
    });
    setSessionRefresher('customer', refresher);
    // First attempt 401, the replayed attempt 200.
    stubSequence([401, 200], { items: [] });

    const result = await request<{ items: unknown[] }>('/customer/bookings');

    expect(result).toEqual({ items: [] });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    // The replay carries the rotated token, not the stale one.
    expect(calls[0]?.headers.Authorization).toBe('Bearer stale-token');
    expect(calls[1]?.headers.Authorization).toBe('Bearer fresh-token');
  });

  it('surfaces the 401 and expires the session when the refresh is refused', async () => {
    const expired = vi.fn();
    setSessionRefresher('customer', async () => false);
    setSessionExpiredHandler('customer', expired);
    stubSequence([401]);

    await expect(request('/customer/bookings')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not refresh an unauthenticated request', async () => {
    const refresher = vi.fn(async () => true);
    setSessionRefresher('customer', refresher);
    stubSequence([401]);

    await expect(request('/customer/auth/login', { method: 'POST', auth: false })).rejects.toBeInstanceOf(ApiError);
    expect(refresher).not.toHaveBeenCalled();
  });

  it('does not refresh a 403, which is a permission refusal, not an expiry', async () => {
    const refresher = vi.fn(async () => true);
    setSessionRefresher('customer', refresher);
    stubSequence([403]);

    await expect(request('/provider/profile', { plane: 'staff' })).rejects.toMatchObject({ kind: 'forbidden' });
    expect(refresher).not.toHaveBeenCalled();
  });

  it('rotates once across concurrent 401s rather than once per request', async () => {
    let resolveRefresh: ((value: boolean) => void) | undefined;
    const refresher = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    setSessionRefresher('customer', refresher);
    stubSequence([401, 401, 401, 200, 200, 200], { ok: true });

    const pending = Promise.all([request('/a'), request('/b'), request('/c')]);
    // Let the three first attempts fail and reach the refresh.
    await vi.waitFor(() => expect(refresher).toHaveBeenCalled());
    resolveRefresh?.(true);
    await pending;

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(6);
  });

  it('keeps the two planes independent', async () => {
    const customerRefresher = vi.fn(async () => true);
    const staffRefresher = vi.fn(async () => true);
    setSessionRefresher('customer', customerRefresher);
    setSessionRefresher('staff', staffRefresher);
    stubSequence([401, 200], { ok: true });

    await request('/provider/profile', { plane: 'staff' });

    expect(staffRefresher).toHaveBeenCalledTimes(1);
    expect(customerRefresher).not.toHaveBeenCalled();
  });

  it('leaves the access token untouched until the refresher adopts a new one', async () => {
    setSessionRefresher('customer', async () => false);
    stubSequence([401]);
    await request('/customer/bookings').catch(() => undefined);
    expect(getAccessToken()).toBe('stale-token');
  });
});

describe('session refresh on an upload', () => {
  it('rotates and re-sends a photograph rather than losing it', async () => {
    setAccessToken('stale-token');
    const refresher = vi.fn(async () => {
      setAccessToken('fresh-token');
      return true;
    });
    setSessionRefresher('customer', refresher);
    // The first POST 401s; the replay succeeds.
    calls = [];
    let index = 0;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      // The web branch fetches the file URI into a Blob before uploading, so
      // only the multipart POST is counted.
      if (init.method !== 'POST') {
        return new Response('bytes', { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      const status = [401, 201][index] ?? 201;
      index += 1;
      calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
      return new Response(JSON.stringify(status >= 400 ? { message: 'expired' } : { id: 'img-1' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await uploadFile<{ id: string }>(
      '/customer/inspection-photos',
      { uri: 'data:text/plain;base64,aGVsbG8=', name: 'a.jpg', mimeType: 'image/jpeg' },
    );

    expect(result).toEqual({ id: 'img-1' });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers.Authorization).toBe('Bearer stale-token');
    expect(calls[1]?.headers.Authorization).toBe('Bearer fresh-token');
  });
});
