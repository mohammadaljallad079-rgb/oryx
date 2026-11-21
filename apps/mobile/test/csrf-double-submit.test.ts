import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getCsrfToken,
  getStaffCsrfToken,
  inspectionPhotosApi,
  request,
  setAccessToken,
  setCsrfToken,
  setStaffAccessToken,
  setStaffCsrfToken,
} from '../src/lib/api';

/**
 * The customer/staff double-submit header.
 *
 * The API issues the refresh token in an HttpOnly cookie scoped to
 * `/api/v1/customer` (and `/api/v1/auth` for staff). React Native's cookie jar
 * replays that cookie on every request to the scope, so `CsrfGuard` requires the
 * matching `x-oryx-csrf` header on every unsafe method. A native client has no
 * `document.cookie`, so the app must take the value from the login/refresh body
 * and echo it — without this, every authenticated POST the app makes (cancel a
 * booking, save a vehicle, upload a photo) is answered 403 even though the
 * access token is perfectly valid.
 *
 * These tests pin the header onto both planes and pin it *off* GETs, where a
 * double submit is unnecessary and would only widen the token's exposure.
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
}

let captured: Captured[] = [];

function stubFetch(status = 200, payload: unknown = { ok: true }) {
  captured = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    captured.push({
      url,
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

afterEach(() => {
  setAccessToken(null);
  setCsrfToken(null);
  setStaffAccessToken(null);
  setStaffCsrfToken(null);
  vi.unstubAllGlobals();
});

describe('customer double-submit', () => {
  it('echoes the stored token on an unsafe method', async () => {
    stubFetch();
    setAccessToken('consumer-token');
    setCsrfToken('customer-csrf');
    await request('/customer/bookings/abc/cancel', { method: 'POST', body: {} });
    expect(captured[0]?.headers['x-oryx-csrf']).toBe('customer-csrf');
  });

  it('omits the header on a GET', async () => {
    stubFetch();
    setAccessToken('consumer-token');
    setCsrfToken('customer-csrf');
    await request('/customer/bookings');
    expect(captured[0]?.headers['x-oryx-csrf']).toBeUndefined();
  });

  it('sends no header when no token is stored', async () => {
    stubFetch();
    setAccessToken('consumer-token');
    await request('/customer/bookings', { method: 'POST', body: {} });
    expect(captured[0]?.headers['x-oryx-csrf']).toBeUndefined();
  });

  it('carries the header on a multipart upload', async () => {
    stubFetch(201, { id: 'img-1' });
    setAccessToken('consumer-token');
    setCsrfToken('customer-csrf');
    await inspectionPhotosApi.upload(
      { uri: 'file:///tmp/a.png', name: 'a.png', mimeType: 'image/png' },
      { caption: 'front' },
    );
    expect(captured[0]?.headers['x-oryx-csrf']).toBe('customer-csrf');
  });

  it('keeps the two planes independent', () => {
    setCsrfToken('c');
    setStaffCsrfToken('s');
    expect(getCsrfToken()).toBe('c');
    expect(getStaffCsrfToken()).toBe('s');
    setStaffCsrfToken(null);
    expect(getCsrfToken()).toBe('c');
    expect(getStaffCsrfToken()).toBeNull();
  });
});

describe('staff double-submit', () => {
  it('uses the staff token, not the consumer one, on the staff plane', async () => {
    stubFetch();
    setAccessToken('consumer-token');
    setCsrfToken('customer-csrf');
    setStaffAccessToken('staff-token');
    setStaffCsrfToken('staff-csrf');
    await request('/provider/profile', { method: 'PATCH', body: {}, plane: 'staff' });
    expect(captured[0]?.headers['x-oryx-csrf']).toBe('staff-csrf');
  });
});
