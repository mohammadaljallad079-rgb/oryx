import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  catalogApi,
  getAccessToken,
  getStaffAccessToken,
  paymentsApi,
  providerApi,
  request,
  serviceRequestsApi,
  setAccessToken,
  subscriptionApi,
  setStaffAccessToken,
  vehiclesApi,
} from '../src/lib/api';

/**
 * The live endpoints Execution 10 wired into the app.
 *
 * Every one of these must ride the **consumer** plane: a payment history, a
 * vehicle's service history and a service request all belong to the signed-in
 * customer, and the API resolves the account from the bearer token rather than a
 * path or query parameter. These tests pin the plane and the exact route so a
 * later edit cannot quietly send a staff token or a foreign account id.
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

function stubFetch(status = 200, payload: unknown = {}) {
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

describe('customer payment history', () => {
  it('reads /customer/payments on the consumer plane', async () => {
    stubFetch(200, { items: [], total: 0 });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await paymentsApi.history({ pageSize: 50 });
    expect(captured[0]?.url).toContain('/customer/payments');
    expect(captured[0]?.url).toContain('pageSize=50');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
  });

  it('never offers a top-up route, because the API has none', () => {
    // A screen that could add money locally would be a fiction; the absence of
    // this method is the guard.
    expect((paymentsApi as unknown as Record<string, unknown>).topUp).toBeUndefined();
  });
});

describe('vehicle garage', () => {
  it('registers a vehicle through the consumer route', async () => {
    stubFetch(201, { id: 'v1', vin: 'JT111EXEC10TEST01' });
    setAccessToken('consumer-token');
    await vehiclesApi.create({
      vin: 'JT111EXEC10TEST01',
      make: 'Toyota',
      model: 'Land Cruiser',
      modelYear: 2022,
      plateNumber: 'E10-1234',
    });
    expect(captured[0]?.url).toContain('/customer/vehicles');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
    expect(JSON.parse(captured[0]?.body as string).vin).toBe('JT111EXEC10TEST01');
  });
});

describe('merchant recovery queue', () => {
  it('accepts a request on the provider portal staff plane', async () => {
    stubFetch(200, { id: 'r1', status: 'ASSIGNED' });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await providerApi.acceptRequest('r1');
    expect(captured[0]?.url).toContain('/provider/requests/r1/accept');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.headers.Authorization).toBe('Bearer staff-token');
  });

  it('sends no provider id, so the server resolves it from membership', async () => {
    stubFetch(200, { items: [], total: 0 });
    setStaffAccessToken('staff-token');
    await providerApi.requests({ pageSize: 50 });
    expect(captured[0]?.url).toContain('/provider/requests?');
    expect(captured[0]?.url).not.toContain('providerId');
  });
});

describe('vehicle service history', () => {
  it('reads /customer/vehicles/:id/history and encodes the id', async () => {
    stubFetch(200, { vehicle: { id: 'a/b' }, inspections: [], maintenance: [], jobCards: [], warranties: [] });
    setAccessToken('consumer-token');
    await vehiclesApi.history('a/b');
    expect(captured[0]?.url).toContain('/customer/vehicles/a%2Fb/history');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
  });
});

describe('service requests', () => {
  it('lists the customer requests from the token scope', async () => {
    stubFetch(200, { items: [], total: 0 });
    setAccessToken('consumer-token');
    await serviceRequestsApi.list();
    expect(captured[0]?.url).toContain('/customer/marketplace/requests');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
  });

  it('cancels through the request-specific cancel route', async () => {
    stubFetch(200, { id: 'r1', status: 'CANCELLED' });
    setAccessToken('consumer-token');
    await serviceRequestsApi.cancel('r1', 'changed my mind');
    expect(captured[0]?.url).toContain('/customer/marketplace/requests/r1/cancel');
    expect(captured[0]?.method).toBe('POST');
    expect(JSON.parse(captured[0]?.body as string)).toEqual({ reason: 'changed my mind' });
  });
});

describe('promotional offers', () => {
  it('reads the public customer feed with no token', async () => {
    stubFetch(200, []);
    setAccessToken(null);
    await catalogApi.offers();
    expect(captured[0]?.url).toContain('/customer/catalog/offers');
    expect(captured[0]?.headers.Authorization).toBeUndefined();
  });

  it('passes the category filter through to the server', async () => {
    stubFetch(200, []);
    await catalogApi.offers({ categoryKey: 'maintenance', limit: 5 });
    expect(captured[0]?.url).toContain('categoryKey=maintenance');
    expect(captured[0]?.url).toContain('limit=5');
  });

  it('lists the merchant own offers on the staff plane', async () => {
    stubFetch(200, []);
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await providerApi.offers({ includeInactive: true });
    expect(captured[0]?.url).toContain('/provider/offers');
    expect(captured[0]?.url).toContain('includeInactive=true');
    expect(captured[0]?.headers.Authorization).toBe('Bearer staff-token');
  });

  it('creates an offer with the basis-point discount the server expects', async () => {
    stubFetch(201, { id: 'o1' });
    setStaffAccessToken('staff-token');
    await providerApi.createOffer({
      titleEn: 'Winter',
      titleAr: 'شتاء',
      percentOffBp: 1500,
    });
    expect(captured[0]?.method).toBe('POST');
    expect(JSON.parse(captured[0]?.body as string)).toEqual({
      titleEn: 'Winter',
      titleAr: 'شتاء',
      percentOffBp: 1500,
    });
  });

  it('withdraws through the offer-specific patch route', async () => {
    stubFetch(200, { id: 'o1', isActive: false });
    setStaffAccessToken('staff-token');
    await providerApi.updateOffer('o1', { isActive: false });
    expect(captured[0]?.url).toContain('/provider/offers/o1');
    expect(captured[0]?.method).toBe('PATCH');
    expect(JSON.parse(captured[0]?.body as string)).toEqual({ isActive: false });
  });
});

describe('subscription reads', () => {
  it('reads the plan catalogue on the staff plane', async () => {
    stubFetch(200, []);
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await subscriptionApi.plans();
    expect(captured[0]?.url).toContain('/plans?includeInactive=false');
    expect(captured[0]?.headers.Authorization).toBe('Bearer staff-token');
  });

  it('reads the tenant own subscription without sending a company id', async () => {
    stubFetch(200, []);
    setStaffAccessToken('staff-token');
    await subscriptionApi.current();
    expect(captured[0]?.url).toContain('/subscriptions');
    expect(captured[0]?.url).not.toContain('companyId');
  });
});

describe('plane isolation for the new calls', () => {
  it('does not put the staff token on a consumer route', async () => {
    stubFetch(200, { items: [], total: 0 });
    setAccessToken(null);
    setStaffAccessToken('staff-token');
    await request('/customer/payments');
    expect(captured[0]?.headers.Authorization).toBeUndefined();
  });

  it('keeps the consumer token out of a staff route', async () => {
    stubFetch(200, {});
    setAccessToken('consumer-token');
    setStaffAccessToken(null);
    await request('/provider/profile', { plane: 'staff' });
    expect(captured[0]?.headers.Authorization).toBeUndefined();
    expect(getAccessToken()).toBe('consumer-token');
    expect(getStaffAccessToken()).toBeNull();
  });
});
