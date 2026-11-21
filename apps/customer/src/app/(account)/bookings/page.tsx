'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { customerApi, IS_STATIC_PREVIEW, publicApi, SERVICE_CATEGORIES, type WebsiteCategory, type AvailableDay, type AvailableSlot } from '@/lib/api';
import { useSiteContent } from '@/lib/site-content-context';
import { messageOf, useAsync } from '@/lib/hooks';
import { Alert, Button, Card, Field, StatusBadge, bookingTypeLabel, formatDate } from '@/components/ui';
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
    <Suspense
      fallback={
        <div className="oryx-account-page">
          <LoadingPanel rows={4} />
        </div>
      }
    >
      <BookingsContent />
    </Suspense>
  );
}

function BookingsContent() {
  const { t, locale } = useUi();
  const { content } = useSiteContent();
  const params = useSearchParams();

  const bookings = useAsync(() => customerApi.bookings(), []);
  const vehicles = useAsync(() => customerApi.vehicles(), []);

  /**
   * An inspection chosen on the website arrives as `?serviceId=<id>`.
   *
   * The id is the approved `InspectionService` the customer clicked, and it is
   * what the booking engine is asked to hold a slot for. The display name is
   * only used to label the choice; the id is never derived from it.
   */
  const initialServiceId = params.get('serviceId');
  const [inspectionService, setInspectionService] = useState<{ id: string; name: string } | null>(
    initialServiceId
      ? { id: initialServiceId, name: params.get('service') ?? initialServiceId }
      : null,
  );

  useEffect(() => {
    if (!initialServiceId || params.get('service')) return;
    let active = true;
    publicApi.inspectionServices().then((page) => {
      const found = page.items.find((item) => item.id === initialServiceId);
      if (active && found) setInspectionService({ id: found.id, name: found.nameEn });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [initialServiceId, params]);

  const initialCategory = params.get('category') ?? (IS_STATIC_PREVIEW ? SERVICE_CATEGORIES[0].key : '');
  const [categoryKey, setCategoryKey] = useState<string>(initialCategory);
  const [liveCategories, setLiveCategories] = useState<WebsiteCategory[]>([]);
  useEffect(() => {
    let active = true;
    publicApi.website(locale).then((response) => {
      if (active) {
        setLiveCategories(response.categories);
        setCategoryKey((current) => response.categories.some((item) => item.key === current) ? current : (response.categories[0]?.key ?? ''));
      }
    }).catch(() => {
      if (active) setLiveCategories([]);
    });
    return () => { active = false; };
  }, [locale]);
  const serviceOptions = IS_STATIC_PREVIEW
    ? SERVICE_CATEGORIES.map((category) => ({ key: category.key, nameAr: category.nameAr, nameEn: category.nameEn }))
    : liveCategories;
  const whatsapp = content.contact.whatsapp.replace(/\D/g, '');
  const selectedService = serviceOptions.find((category) => category.key === categoryKey);
  const serviceName = selectedService
    ? (locale === 'ar' ? selectedService.nameAr : selectedService.nameEn) || selectedService.nameEn || selectedService.nameAr
    : categoryKey;
  const [bookingType, setBookingType] = useState<'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE'>(
    'INSPECTION',
  );
  // A chosen inspection is an inspection booking; the type follows it instead of
  // letting the two disagree.
  const effectiveType = inspectionService ? 'INSPECTION' : bookingType;
  /** What the engine is asked to book: an inspection id, or a service category. */
  const serviceRef = inspectionService?.id ?? categoryKey;
  const [date, setDate] = useState(todayIso());
  const whatsappMessage = locale === 'ar'
    ? `مرحباً، أرغب بحجز ${serviceName} بتاريخ ${date}. يرجى تأكيد الموعد المتاح.`
    : `Hello, I would like to book ${serviceName} on ${date}. Please confirm availability.`;
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [openDays, setOpenDays] = useState<AvailableDay[]>([]);
  const [daysLoading, setDaysLoading] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const duration = DURATIONS[effectiveType] ?? 60;

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    setError(null);
    setChosen(null);
    try {
      const result = await customerApi.availability({
        date,
        durationMinutes: duration,
        serviceRef,
      });
      setSlots(result);
    } catch (err) {
      setError(messageOf(err));
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [date, duration, serviceRef]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  /**
   * The days that actually have a bookable slot.
   *
   * Loading these first lets the form steer the customer to an open day instead
   * of letting them pick a closed one and then reporting "no slots", which
   * looks like a fault. The list is refetched when the service or duration
   * changes, because availability is per service.
   */
  const loadOpenDays = useCallback(async () => {
    setDaysLoading(true);
    try {
      const days = await customerApi.availabilityDays({
        from: todayIso(),
        durationMinutes: duration,
        days: 21,
        serviceRef,
      });
      setOpenDays(days.filter((day) => day.slots > 0));
    } catch {
      setOpenDays([]);
    } finally {
      setDaysLoading(false);
    }
  }, [duration, serviceRef]);

  useEffect(() => {
    void loadOpenDays();
  }, [loadOpenDays]);

  // Move off a closed day: when the open-day list arrives and the selected date
  // is not on it, jump to the first open day. An empty list (everything closed)
  // leaves the choice alone rather than fighting the user.
  useEffect(() => {
    if (daysLoading || openDays.length === 0) return;
    if (!openDays.some((day) => day.date === date)) {
      setDate(openDays[0].date);
    }
  }, [openDays, daysLoading, date]);

  const selectedDayOpen = openDays.length === 0 || openDays.some((day) => day.date === date);

  async function confirmBooking() {
    if (!chosen) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const booking = await customerApi.createBooking({
        bookingType: effectiveType,
        startsAt: chosen,
        durationMinutes: duration,
        serviceRef,
        ...(vehicleId ? { vehicleId } : {}),
        ...(notes ? { notes } : {}),
      });
      setNotice(`${booking.reference ?? booking.id} — ${t('bookings.confirm')}`);
      setChosen(null);
      await bookings.reload();
      await loadSlots();
      await loadOpenDays();
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
              value={effectiveType}
              onChange={(e) => setBookingType(e.target.value as typeof bookingType)}
              disabled={Boolean(inspectionService)}
              data-testid="booking-type"
            >
              <option value="INSPECTION">{t('bookings.inspection')}</option>
              <option value="MAINTENANCE">{t('bookings.maintenance')}</option>
              <option value="PROVIDER_SERVICE">{t('bookings.providerService')}</option>
            </select>
          </Field>

          <Field label={t('services.title')}>
            {inspectionService ? (
              <div className="oryx-inspection-choice" data-testid="booking-inspection">
                <span>
                  <Icon name="clipboard" size={15} />
                  <strong>{inspectionService.name}</strong>
                </span>
                <button
                  type="button"
                  className="oryx-btn oryx-btn-sm"
                  onClick={() => setInspectionService(null)}
                  data-testid="booking-inspection-clear"
                >
                  {t('inspection.change')}
                </button>
              </div>
            ) : (
              <select
                className="oryx-select"
                value={categoryKey}
                onChange={(e) => setCategoryKey(e.target.value)}
              >
                {serviceOptions.map((category) => (
                  <option key={category.key} value={category.key}>
                    {locale === 'ar' ? category.nameAr : category.nameEn}
                  </option>
                ))}
              </select>
            )}
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

          <Field
            label={t('bookings.pickDate')}
            hint={
              daysLoading
                ? t('bookings.checkingDays')
                : openDays.length === 0
                  ? t('bookings.noOpenDays')
                  : t('bookings.openDays', { count: String(openDays.length) })
            }
          >
            <input
              className="oryx-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              dir="ltr"
              data-testid="booking-date"
            />
            {!daysLoading && openDays.length > 0 && !selectedDayOpen && (
              <p className="oryx-muted" data-testid="booking-closed-day" style={{ marginTop: 6 }}>
                {t('bookings.closedDayHint')}
              </p>
            )}
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
              <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
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
          {whatsapp && (
            <div style={{ marginTop: 16 }}>
              <a className="oryx-btn" target="_blank" rel="noopener noreferrer"
                href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(whatsappMessage)}`}>
                <Icon name="phone" size={16} /> {locale === 'ar' ? 'استفسار وحجز عبر واتساب' : 'Enquire or book via WhatsApp'}
              </a>
            </div>
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
                      <td>{bookingTypeLabel(t, booking.bookingType)}</td>
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
