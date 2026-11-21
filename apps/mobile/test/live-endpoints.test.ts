import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bookingsApi,
  catalogApi,
  fitmentApi,
  fleetsApi,
  getAccessToken,
  getStaffAccessToken,
  paymentsApi,
  providerApi,
  recoveryApi,
  request,
  returnsApi,
  rfqsApi,
  sensageAiApi,
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

describe('merchant document register (requirement A)', () => {
  it('reads /provider/documents on the staff plane, sending no company id', async () => {
    stubFetch(200, { items: [], total: 0, page: 1, pageSize: 20 });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await providerApi.documents({ search: 'INV-001', type: 'SALES_INVOICE' });
    expect(captured[0]?.url).toContain('/provider/documents?');
    expect(captured[0]?.url).toContain('search=INV-001');
    expect(captured[0]?.url).toContain('type=SALES_INVOICE');
    // The tenant is resolved from provider membership server-side; a company id
    // here would be a cross-tenant read waiting to happen.
    expect(captured[0]?.url).not.toContain('companyId');
    expect(captured[0]?.headers.Authorization).toBe('Bearer staff-token');
  });

  it('reads one document and its verification view through the provider routes', async () => {
    stubFetch(200, { id: 'd1', documentNumber: 'INV-001' });
    setStaffAccessToken('staff-token');
    await providerApi.document('d1');
    expect(captured[0]?.url).toContain('/provider/documents/d1');
    expect(captured[0]?.headers.Authorization).toBe('Bearer staff-token');

    stubFetch(200, { verificationUrl: 'http://localhost:3000/verify/tok', view: null });
    await providerApi.documentVerification('d1');
    expect(captured[0]?.url).toContain('/provider/documents/d1/verification');
  });

  it('builds the PDF file URL under the provider route', () => {
    expect(providerApi.documentFileUrl('d1')).toContain('/provider/documents/d1/file');
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

describe('customer booking reschedule', () => {
  it('posts the new time to the customer-owned reschedule route', async () => {
    stubFetch(200, { id: 'b1', status: 'RESCHEDULED' });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await bookingsApi.reschedule('b1', '2026-11-03T14:00:00.000Z', 60);
    expect(captured[0]?.url).toContain('/customer/bookings/b1/reschedule');
    expect(captured[0]?.method).toBe('POST');
    // The consumer plane, never the staff token: a booking belongs to the
    // signed-in customer and the API scopes it from the bearer.
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
    expect(JSON.parse(captured[0]?.body as string)).toEqual({
      startsAt: '2026-11-03T14:00:00.000Z',
      durationMinutes: 60,
    });
  });

  it('encodes the booking id in the path', async () => {
    stubFetch(200, { id: 'b/2', status: 'RESCHEDULED' });
    setAccessToken('consumer-token');
    await bookingsApi.reschedule('b/2', '2026-11-03T14:00:00.000Z', 30);
    expect(captured[0]?.url).toContain('/customer/bookings/b%2F2/reschedule');
  });
});

/**
 * The planned-ecosystem endpoints (Execution 20, P4–P7).
 *
 * Each of these must ride the consumer plane: an RFQ, a return, a recovery job,
 * a fleet, a fitment answer and an AI suggestion all belong to the signed-in
 * customer, and the API resolves the account from the bearer token rather than a
 * path or query parameter. These tests pin the plane and the exact route so a
 * later edit cannot send a staff token or a foreign account id.
 */
describe('planned ecosystem endpoints', () => {
  it('raises an RFQ on the consumer plane', async () => {
    stubFetch(201, { id: 'rfq1', reference: 'RFQ-1' });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await rfqsApi.create({ categoryKey: 'spare_parts', description: 'Front brake pads', quantity: 2 });
    expect(captured[0]?.url).toContain('/customer/rfqs');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
    expect(JSON.parse(captured[0]?.body as string)).toEqual({
      categoryKey: 'spare_parts',
      description: 'Front brake pads',
      quantity: 2,
    });
  });

  it('accepts a quote through the rfq-scoped accept route', async () => {
    stubFetch(200, { id: 'rfq1', acceptedQuoteId: 'q1' });
    setAccessToken('consumer-token');
    await rfqsApi.acceptQuote('rfq1', 'q1');
    expect(captured[0]?.url).toContain('/customer/rfqs/rfq1/quotes/q1/accept');
    expect(captured[0]?.method).toBe('POST');
  });

  it('encodes the rfq and quote ids when accepting', async () => {
    stubFetch(200, {});
    setAccessToken('consumer-token');
    await rfqsApi.acceptQuote('r/1', 'q/1');
    expect(captured[0]?.url).toContain('/customer/rfqs/r%2F1/quotes/q%2F1/accept');
  });

  it('raises a return against the caller own order', async () => {
    stubFetch(201, { id: 'ret1', status: 'REQUESTED' });
    setAccessToken('consumer-token');
    await returnsApi.create('order-9', {
      reason: 'Wrong part',
      lines: [{ orderLineId: 'line-1', quantity: 1 }],
    });
    expect(captured[0]?.url).toContain('/customer/orders/order-9/returns');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
  });

  it('lists returns from the token scope with no account id', async () => {
    stubFetch(200, []);
    setAccessToken('consumer-token');
    await returnsApi.list();
    expect(captured[0]?.url).toContain('/customer/returns');
    expect(captured[0]?.url).not.toContain('accountId');
  });

  it('raises a recovery with the pickup coordinates the server requires', async () => {
    stubFetch(201, { id: 'rec1', reference: 'REC-1' });
    setAccessToken('consumer-token');
    setStaffAccessToken('staff-token');
    await recoveryApi.create({
      pickupLatitude: 26.2285,
      pickupLongitude: 50.586,
      contactPhone: '+97330000000',
      issue: 'Flat battery',
      urgency: 'URGENT',
    });
    expect(captured[0]?.url).toContain('/customer/recovery');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
    expect(JSON.parse(captured[0]?.body as string).pickupLatitude).toBe(26.2285);
  });

  it('tracks a recovery through the recovery-specific route', async () => {
    stubFetch(200, { id: 'rec1', timeline: [] });
    setAccessToken('consumer-token');
    await recoveryApi.get('rec/1');
    expect(captured[0]?.url).toContain('/customer/recovery/rec%2F1');
  });

  it('creates a fleet and lists it from the token scope', async () => {
    stubFetch(201, { id: 'f1', name: 'Delivery fleet' });
    setAccessToken('consumer-token');
    await fleetsApi.create({ name: 'Delivery fleet', contactPhone: '+97330000000' });
    expect(captured[0]?.url).toContain('/customer/fleets');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
  });

  it('toggles a driver through the fleet-scoped route', async () => {
    stubFetch(200, { id: 'f1', drivers: [] });
    setAccessToken('consumer-token');
    await fleetsApi.setDriverActive('f1', 'd1', false);
    expect(captured[0]?.url).toContain('/customer/fleets/f1/drivers/d1/active');
    expect(JSON.parse(captured[0]?.body as string)).toEqual({ isActive: false });
  });

  it('checks fitment for the caller own vehicle and product', async () => {
    stubFetch(200, { compatible: true, fitmentKnown: true });
    setAccessToken('consumer-token');
    await fitmentApi.check('v1', 'p1');
    expect(captured[0]?.url).toContain('/customer/fitment?vehicleId=v1&productId=p1');
    expect(captured[0]?.headers.Authorization).toBe('Bearer consumer-token');
  });

  it('reports the SENSAGE status without claiming a model is configured', async () => {
    stubFetch(200, { providerKey: 'SENSAGE_AI', configured: false, message: 'not configured' });
    setAccessToken('consumer-token');
    const status = await sensageAiApi.status();
    expect(captured[0]?.url).toContain('/customer/sensage/status');
    expect(status.configured).toBe(false);
  });

  it('requests an analysis and reads the suggestion back as pending', async () => {
    stubFetch(201, { id: 's1', reviewStatus: 'PENDING', verified: false });
    setAccessToken('consumer-token');
    const suggestion = await sensageAiApi.analyze({ photoId: 'photo-1' });
    expect(captured[0]?.url).toContain('/customer/sensage/analyze');
    expect(captured[0]?.method).toBe('POST');
    // A suggestion is never verified on creation; the screen must not present
    // the model output as a diagnosis.
    expect(suggestion.verified).toBe(false);
    expect(suggestion.reviewStatus).toBe('PENDING');
  });
});

