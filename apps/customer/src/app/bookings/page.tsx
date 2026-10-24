'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { customerApi, SERVICE_CATEGORIES, type AvailableSlot } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Alert, Button, Card, Field, StatusBadge, formatDate } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel, TableWrap } from '@/components/premium';
import { Icon } from '@/components/icons';

const DURATIONS: Record<string, number> = {
  INSPECTION: 60,
  MAINTENANCE: 120,
  PROVIDER_SERVICE: 90,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Booking engine: pick a service, a vehicle and a real available slot. */
export default function BookingsPage() {
  return (
    <RequireCustomer>
      <Suspense
        fallback={
          <div className="oryx-container">
            <LoadingPanel rows={4} />
          </div>
        }
      >
        <BookingsContent />
      </Suspense>
    </RequireCustomer>
  );
}

function BookingsContent() {
  const { t, locale } = useUi();
  const params = useSearchParams();

  const bookings = useAsync(() => customerApi.bookings(), []);
  const vehicles = useAsync(() => customerApi.vehicles(), []);

  const initialCategory = params.get('category') ?? SERVICE_CATEGORIES[0].key;
  const [categoryKey, setCategoryKey] = useState<string>(initialCategory);
  const [bookingType, setBookingType] = useState<'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE'>(
    'INSPECTION',
  );
  const [date, setDate] = useState(todayIso());
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const duration = DURATIONS[bookingType] ?? 60;

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    setError(null);
    setChosen(null);
    try {
      const result = await customerApi.availability({
        date,
        durationMinutes: duration,
        serviceRef: categoryKey,
      });
      setSlots(result);
    } catch (err) {
      setError(messageOf(err));
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [date, duration, categoryKey]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  async function confirmBooking() {
    if (!chosen) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const booking = await customerApi.createBooking({
        bookingType,
        startsAt: chosen,
        durationMinutes: duration,
        serviceRef: categoryKey,
        ...(vehicleId ? { vehicleId } : {}),
        ...(notes ? { notes } : {}),
      });
      setNotice(`${booking.reference ?? booking.id} — ${t('bookings.confirm')}`);
      setChosen(null);
      await bookings.reload();
      await loadSlots();
    } catch (err) {
      // A taken slot is the expected concurrency outcome, not a crash.
      setError(messageOf(err));
      await loadSlots();
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking(id: string) {
    setError(null);
    try {
      await customerApi.cancelBooking(id, 'Customer cancelled from the website.');
      await bookings.reload();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  const active = bookings.data?.items ?? [];

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('bookings.new')}
        subtitle={t('bookings.subtitle')}
        art="/art/service-maintenance.svg"
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert>{error}</Alert>
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="oryx-grid oryx-split">
        <Card title={t('bookings.details')} subtitle={t('bookings.detailsHint')}>
          <Field label={t('bookings.type')}>
            <select
              className="oryx-select"
              value={bookingType}
              onChange={(e) => setBookingType(e.target.value as typeof bookingType)}
              data-testid="booking-type"
            >
              <option value="INSPECTION">{t('bookings.inspection')}</option>
              <option value="MAINTENANCE">{t('bookings.maintenance')}</option>
              <option value="PROVIDER_SERVICE">{t('bookings.providerService')}</option>
            </select>
          </Field>

          <Field label={t('services.title')}>
            <select
              className="oryx-select"
              value={categoryKey}
              onChange={(e) => setCategoryKey(e.target.value)}
            >
              {SERVICE_CATEGORIES.map((category) => (
                <option key={category.key} value={category.key}>
                  {locale === 'ar' ? category.nameAr : category.nameEn}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('bookings.pickVehicle')} hint={t('common.optional')}>
            <select
              className="oryx-select"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              data-testid="booking-vehicle"
            >
              <option value="">—</option>
              {vehicles.data?.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.make} {vehicle.model} · {vehicle.plateNumber ?? vehicle.vin}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('bookings.pickDate')}>
            <input
              className="oryx-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              dir="ltr"
              data-testid="booking-date"
            />
          </Field>

          <Field label={t('support.comment')} hint={t('common.optional')}>
            <textarea
              className="oryx-textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </Card>

        <Card
          title={t('bookings.available')}
          subtitle={t('bookings.slotHint', { date, duration: String(duration) })}
          actions={
            <Button variant="ghost" onClick={() => void loadSlots()}>
              <Icon name="clock" size={15} />
              {t('common.refresh')}
            </Button>
          }
        >
          {slotsLoading ? (
            <LoadingPanel rows={3} />
          ) : slots.length === 0 ? (
            <StatePanel
              icon="calendar"
              title={t('bookings.noSlots')}
              message={t('bookings.noSlotsHint')}
            />
          ) : (
            <>
              <div className="oryx-slot-grid">
                {slots.map((slot) => {
                  const isActive = chosen === slot.startsAt;
                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      className={isActive ? 'oryx-slot oryx-slot--active' : 'oryx-slot'}
                      onClick={() => setChosen(slot.startsAt)}
                      dir="ltr"
                      data-testid="booking-slot"
                    >
                      {new Date(slot.startsAt).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 18 }}>
                <Button
                  variant="primary"
                  disabled={!chosen || busy}
                  onClick={() => void confirmBooking()}
                >
                  <Icon name="check" size={16} />
                  {busy ? t('common.saving') : t('bookings.confirm')}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 24 }}>
        <Card title={t('bookings.title')} subtitle={t('bookings.count', { count: String(active.length) })}>
          {bookings.loading ? (
            <LoadingPanel rows={4} />
          ) : active.length === 0 ? (
            <StatePanel
              icon="calendar"
              title={t('bookings.none')}
              message={t('bookings.noneHint')}
            />
          ) : (
            <TableWrap>
              <table className="oryx-table">
                <thead>
                  <tr>
                    <th>{t('bookings.type')}</th>
                    <th>{t('common.date')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((booking) => (
                    <tr key={booking.id}>
                      <td>{booking.bookingType}</td>
                      <td>{formatDate(booking.startsAt, locale)}</td>
                      <td>
                        <StatusBadge status={booking.status} />
                      </td>
                      <td>
                        {booking.status !== 'CANCELLED' && booking.status !== 'COMPLETED' && (
                          <button
                            type="button"
                            className="oryx-btn oryx-btn-danger"
                            onClick={() => void cancelBooking(booking.id)}
                          >
                            {t('bookings.cancel')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </div>
  );
}
