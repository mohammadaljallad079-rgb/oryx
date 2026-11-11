/**
 * Probes the real customer journey over HTTP against the running API.
 *
 * Not a test — a diagnostic that prints what the API actually answers, so a
 * defect is found from the wire rather than inferred from the source.
 *
 * Usage: node scripts/probe-customer-journey.mjs [--base http://127.0.0.1:3001]
 */
const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(n);
  return i === -1 ? d : args[i + 1];
};
const BASE = (flag('--base') ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const V1 = `${BASE}/api/v1`;

let token = null;
const jar = { csrf: null };

async function call(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
  const h = { 'x-oryx-client': 'mobile', ...headers };
  if (body) h['Content-Type'] = 'application/json';
  if (auth && token) h.Authorization = `Bearer ${token}`;
  if (jar.csrf && method !== 'GET') h['x-oryx-csrf'] = jar.csrf;
  const res = await fetch(`${V1}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

const line = (label, value) => console.log(`  ${label.padEnd(34)} ${value}`);

async function main() {
  console.log(`ORYX customer journey probe -> ${BASE}\n`);
  const stamp = Date.now();
  const email = `probe.${stamp}@oryx-probe.local`;
  const password = 'ProbePass!2026';

  // 1. Register
  console.log('1. Register');
  let r = await call('/customer/auth/register', {
    method: 'POST',
    auth: false,
    body: { email, password, fullName: 'Journey Probe', preferredLocale: 'en' },
  });
  line('status', r.status);
  if (r.status !== 201 && r.status !== 200) {
    console.log('  body:', JSON.stringify(r.body));
    return;
  }
  token = r.body.accessToken;
  jar.csrf = r.body.csrfToken ?? null;
  line('accessToken', token ? `${token.slice(0, 18)}…` : 'MISSING');
  line('csrfToken', jar.csrf ? 'present' : 'MISSING');

  // 2. Me
  console.log('\n2. GET /customer/auth/me');
  r = await call('/customer/auth/me');
  line('status', r.status);
  line('email', r.body?.email ?? JSON.stringify(r.body));
  const accountId = r.body?.id;

  // 3. Vehicle catalogue (public)
  console.log('\n3. GET /customer/catalog/vehicle-catalog');
  r = await call('/customer/catalog/vehicle-catalog', { auth: false });
  line('status', r.status);
  line('makes', r.body?.makes?.length ?? 'n/a');
  const toyota = r.body?.makes?.find((m) => m.make === 'Toyota');
  line('Toyota models', toyota?.models?.slice(0, 5).join(', ') ?? 'none');
  line('minYear..maxYear', `${r.body?.minYear}..${r.body?.maxYear}`);

  // 4. Create a vehicle using the catalogue
  console.log('\n4. POST /customer/vehicles');
  r = await call('/customer/vehicles', {
    method: 'POST',
    body: {
      make: 'Toyota',
      model: toyota?.models?.[0] ?? 'Camry',
      modelYear: Math.min(r.body?.maxYear ?? 2024, 2024),
      vin: `PROBE${stamp}`.slice(0, 17).toUpperCase(),
      plateNumber: '12345',
      mileage: 1000,
    },
  });
  line('status', r.status);
  const vehicleId = r.body?.id;
  line('vehicleId', vehicleId ?? JSON.stringify(r.body).slice(0, 160));

  // 5. Reject an invalid model
  console.log('\n5. Reject model not offered by the make');
  r = await call('/customer/vehicles', {
    method: 'POST',
    body: {
      make: 'Toyota',
      model: 'Civic',
      modelYear: 2020,
      vin: `BAD${stamp}`.slice(0, 17).toUpperCase(),
    },
  });
  line('status (expect 400)', r.status);
  line('message', r.body?.message ?? 'none');

  // 6. Provider directory
  console.log('\n6. GET /marketplace/providers');
  r = await call('/marketplace/providers?pageSize=5', { auth: false });
  line('status', r.status);
  line('count', r.body?.items?.length ?? 'n/a');
  const provider = r.body?.items?.[0];
  line('first', provider ? `${provider.nameEn} img=${provider.imageUrl ? 'yes' : 'no'}` : 'none');

  // 7. Provider detail
  let serviceName = null;
  if (provider) {
    console.log('\n7. GET /marketplace/providers/:id');
    r = await call(`/marketplace/providers/${provider.id}`, { auth: false });
    line('status', r.status);
    line('listings', r.body?.listings?.length ?? 'n/a');
    serviceName = r.body?.listings?.[0]?.nameEn ?? null;
    line('first listing', serviceName ?? 'none');
  }

  // 8. Availability
  console.log('\n8. GET /customer/bookings/availability');
  const day = new Date();
  day.setDate(day.getDate() + 2);
  const date = day.toISOString().slice(0, 10);
  r = await call(`/customer/bookings/availability?date=${date}&durationMinutes=60`);
  line('status', r.status);
  line('date', date);
  line('slots', Array.isArray(r.body) ? r.body.length : JSON.stringify(r.body).slice(0, 160));
  const allSlots = Array.isArray(r.body) ? r.body : [];
  const slot = allSlots[0] ?? null;
  line('first slot', slot?.startsAt ?? 'none');

  // 9. Create a booking
  console.log('\n9. POST /customer/bookings');
  if (!slot) {
    console.log('  ! no slot to book; skipping creation');
  } else {
    r = await call('/customer/bookings', {
      method: 'POST',
      body: {
        bookingType: 'PROVIDER_SERVICE',
        startsAt: slot.startsAt,
        durationMinutes: 60,
        vehicleId,
        serviceRef: serviceName ?? undefined,
        notes: 'probe',
      },
    });
    line('status', r.status);
    const booking = r.body;
    line('id', booking?.id ?? JSON.stringify(r.body).slice(0, 200));
    line('reference', booking?.reference ?? 'none');
    line('status field', booking?.status ?? 'none');

    // 10. Confirm
    if (booking?.id) {
      console.log('\n10. POST /customer/bookings/:id/confirm');
      r = await call(`/customer/bookings/${booking.id}/confirm`, { method: 'POST' });
      line('status', r.status);
      line('booking status', r.body?.status ?? JSON.stringify(r.body).slice(0, 120));

      // 11. List
      console.log('\n11. GET /customer/bookings');
      r = await call('/customer/bookings?page=1&pageSize=10');
      line('status', r.status);
      line('total', r.body?.total ?? r.body?.items?.length ?? 'n/a');

      // 12. Reschedule to a later slot the same day, if the engine offers one.
      const laterSlot = allSlots.find(
        (s) => new Date(s.startsAt).getTime() > new Date(booking.startsAt).getTime(),
      );
      if (laterSlot) {
        console.log('\n12. POST /customer/bookings/:id/reschedule');
        r = await call(`/customer/bookings/${booking.id}/reschedule`, {
          method: 'POST',
          body: { startsAt: laterSlot.startsAt, durationMinutes: 60 },
        });
        line('status', r.status);
        line('booking status', r.body?.status ?? JSON.stringify(r.body).slice(0, 120));
        line('moved to', r.body?.startsAt ?? 'n/a');
      }

      // 13. Cancel
      console.log('\n13. POST /customer/bookings/:id/cancel');
      r = await call(`/customer/bookings/${booking.id}/cancel`, {
        method: 'POST',
        body: { reason: 'probe cleanup' },
      });
      line('status', r.status);
      line('booking status', r.body?.status ?? JSON.stringify(r.body).slice(0, 120));
    }
  }

  // 14. Ownership: another account cannot read the booking
  console.log('\n14. Tenant isolation — a second account');
  const email2 = `probe2.${stamp}@oryx-probe.local`;
  const saved = token;
  const savedCsrf = jar.csrf;
  r = await call('/customer/auth/register', {
    method: 'POST',
    auth: false,
    body: { email: email2, password, fullName: 'Other Probe', preferredLocale: 'en' },
  });
  line('second register', r.status);
  token = r.body.accessToken;
  jar.csrf = r.body.csrfToken ?? null;
  r = await call('/customer/bookings?page=1&pageSize=10');
  line('second account bookings', r.body?.total ?? r.body?.items?.length ?? 'n/a');
  token = saved;
  jar.csrf = savedCsrf;

  console.log('\nProbe complete.');
}

main().catch((e) => {
  console.error('PROBE FAILED:', e.message);
  process.exit(1);
});
