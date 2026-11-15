'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import {
  publicApi,
  type AvailabilitySlot,
  type StorefrontBranch,
  type StorefrontService,
} from '@/lib/api';
import { messageOf } from '@/lib/hooks';
import { Alert, Button, Field, Loading, PageHead } from '@/components/ui';

const STEPS = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6'] as const;

const SERVICE_BOOKING_TYPE: Record<string, 'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE'> = {
  comprehensive_inspection: 'INSPECTION',
  computer_diagnostics: 'INSPECTION',
};

function bookingTypeFor(serviceKey: string): 'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE' {
  return SERVICE_BOOKING_TYPE[serviceKey] ?? 'MAINTENANCE';
}

function dayIso(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function formatTime(iso: string, locale: 'ar' | 'en'): string {
  return new Date(iso).toLocaleTimeString(locale === 'ar' ? 'ar-BH' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDayLabel(iso: string, locale: 'ar' | 'en'): { day: string; num: string } {
  const date = new Date(`${iso}T00:00:00Z`);
  return {
    day: date.toLocaleDateString(locale === 'ar' ? 'ar-BH' : 'en-GB', { weekday: 'short' }),
    num: date.toLocaleDateString(locale === 'ar' ? 'ar-BH' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    }),
  };
}

/**
 * The public booking wizard.
 *
 * It reads the real service taxonomy, the published branches and — for the
 * chosen branch and day — the genuine free appointment times the shared booking
 * engine returns. A visitor can complete a booking as a guest; a signed-in
 * customer can attach one of their garage vehicles. The confirmation carries the
 * reference number the API issued.
 */
export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="oryx-container oryx-section">
          <Loading />
        </div>
      }
    >
      <BookingWizard />
    </Suspense>
  );
}

function BookingWizard() {
  const { t, locale } = useUi();
  const { isAuthenticated, profile } = useCustomerAuth();
  const params = useSearchParams();

  const [services, setServices] = useState<StorefrontService[]>([]);
  const [branches, setBranches] = useState<StorefrontBranch[]>([]);
  const [step, setStep] = useState(0);

  const [serviceKey, setServiceKey] = useState(params.get('service') ?? '');
  const [branchId, setBranchId] = useState(params.get('branchId') ?? '');
  const [date, setDate] = useState(dayIso(1));
  const [slot, setSlot] = useState<AvailabilitySlot | null>(null);

  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [dayAvailability, setDayAvailability] = useState<Array<{ date: string; slots: number }>>([]);

  const [form, setForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    plateNumber: '',
    notes: '',
  });

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<{ reference: string; startsAt: string; serviceRef: string } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    Promise.all([publicApi.storefrontServices(), publicApi.storefrontBranches()])
      .then(([svc, br]) => {
        if (!active) return;
        setServices(svc);
        setBranches(br.filter((b) => b.isPublished && b.bookable));
      })
      .catch(() => {
        if (active) setServices([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (profile) {
      setForm((prev) => ({
        ...prev,
        customerName: prev.customerName || profile.fullName || '',
        email: prev.email || profile.email || '',
        phone: prev.phone || profile.phone || '',
      }));
    }
  }, [profile]);

  const service = useMemo(
    () => services.find((s) => s.key === serviceKey) ?? null,
    [services, serviceKey],
  );
  const branch = useMemo(() => branches.find((b) => b.id === branchId) ?? null, [branches, branchId]);

  const eligibleBranches = useMemo(
    () => (service ? branches.filter((b) => service.branchIds.includes(b.id)) : branches),
    [branches, service],
  );

  const loadSlots = useCallback(
    async (nextBranchId: string, nextDate: string, service: StorefrontService | null) => {
      if (!nextBranchId || !service) {
        setSlots([]);
        return;
      }
      setSlotsLoading(true);
      setError(null);
      setSlot(null);
      try {
        const result = await publicApi.storefrontAvailability({
          date: nextDate,
          durationMinutes: service.durationMinutes,
          branchId: nextBranchId,
        });
        setSlots(result.slots);
      } catch (err) {
        setError(messageOf(err));
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    },
    [],
  );

  // Load slots when the time step opens and again whenever the branch, date or
  // service changes — but not when the wizard merely advances to the details
  // step, which would clear the slot the customer just picked.
  const loadedSlotSignature = useRef('');
  useEffect(() => {
    if (step < 3) return;
    const signature = `${branchId}|${date}|${service?.key ?? ''}`;
    if (signature === loadedSlotSignature.current) return;
    loadedSlotSignature.current = signature;
    void loadSlots(branchId, date, service);
  }, [step, branchId, date, service, loadSlots]);

  // Mark which of the next two weeks are actually bookable and move the
  // selection onto the first open day, so the customer is never dropped on a
  // closed day (for example the Friday/Saturday weekend in Bahrain).
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => dayIso(i + 1)), []);
  const dateRef = useRef(date);
  dateRef.current = date;
  useEffect(() => {
    if (!branchId || !service) {
      setDayAvailability([]);
      return;
    }
    let active = true;
    publicApi
      .storefrontAvailabilityDays({
        days: 15,
        durationMinutes: service.durationMinutes,
        branchId,
      })
      .then((result) => {
        if (!active) return;
        const window = result.days.filter((d) => days.includes(d.date));
        setDayAvailability(window);
        const firstOpen = window.find((d) => d.slots > 0);
        const currentOpen = window.some((d) => d.date === dateRef.current && d.slots > 0);
        if (firstOpen && !currentOpen) {
          setDate(firstOpen.date);
        }
      })
      .catch(() => {
        if (active) setDayAvailability([]);
      });
    return () => {
      active = false;
    };
  }, [branchId, service, days]);

  const canAdvance = useMemo(() => {
    if (step === 0) return Boolean(serviceKey);
    if (step === 1) return Boolean(branchId);
    if (step === 2) return Boolean(date);
    if (step === 3) return slot !== null;
    if (step === 4) return form.customerName.trim().length >= 2 && form.phone.trim().length >= 6;
    return true;
  }, [step, serviceKey, branchId, date, slot, form]);

  const submit = async () => {
    if (!service || !slot) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        vehicleMake: form.vehicleMake.trim() || undefined,
        vehicleModel: form.vehicleModel.trim() || undefined,
        vehicleYear: form.vehicleYear ? Number(form.vehicleYear) : undefined,
        plateNumber: form.plateNumber.trim() || undefined,
        serviceRef: service.key,
        branchId,
        startsAt: slot.startsAt,
        durationMinutes: service.durationMinutes,
        notes: form.notes.trim() || undefined,
        bookingType: bookingTypeFor(service.key),
      };
      const result = isAuthenticated
        ? await (await import('@/lib/api')).customerApi.bookAppointment(body)
        : await publicApi.requestAppointment(body);
      setReference({ reference: result.reference, startsAt: result.startsAt, serviceRef: service.key });
      setStep(5);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const summary = (
    <div className="oryx-summary">
      <h3 className="oryx-h3">{t('booking.summary')}</h3>
      <div className="oryx-summary-row">
        <span className="oryx-muted">{t('booking.step1')}</span>
        <span>{service ? (locale === 'ar' ? service.nameAr : service.nameEn) : '—'}</span>
      </div>
      <div className="oryx-summary-row">
        <span className="oryx-muted">{t('booking.step2')}</span>
        <span>{branch ? (locale === 'ar' ? branch.nameAr : branch.nameEn) : '—'}</span>
      </div>
      <div className="oryx-summary-row">
        <span className="oryx-muted">{t('booking.step3')}</span>
        <span>{date}</span>
      </div>
      <div className="oryx-summary-row">
        <span className="oryx-muted">{t('booking.step4')}</span>
        <span>{slot ? formatTime(slot.startsAt, locale) : '—'}</span>
      </div>
      {service && (
        <div className="oryx-summary-row">
          <span className="oryx-muted">{t('booking.duration')}</span>
          <span>
            {service.durationMinutes} {t('booking.minutes')}
          </span>
        </div>
      )}
    </div>
  );

  if (reference) {
    return (
      <>
        <PageHead title={t('booking.title')} subtitle={t('booking.subtitle')} />
        <section className="oryx-section">
          <div className="oryx-container" style={{ maxWidth: 720 }}>
            <div className="oryx-card" data-testid="booking-success">
              <span className="oryx-badge oryx-badge-success">{t('booking.successTitle')}</span>
              <p style={{ marginTop: 16 }}>{t('booking.successBody')}</p>
              <div className="oryx-spec-list" style={{ margin: '20px 0' }}>
                <div className="oryx-spec-row">
                  <dt>{t('booking.reference')}</dt>
                  <dd data-testid="booking-reference">{reference.reference}</dd>
                </div>
                <div className="oryx-spec-row">
                  <dt>{t('booking.confirmedFor')}</dt>
                  <dd>{new Date(reference.startsAt).toLocaleString(locale === 'ar' ? 'ar-BH' : 'en-GB')}</dd>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    setReference(null);
                    setStep(0);
                    setSlot(null);
                  }}
                >
                  {t('booking.bookAnother')}
                </Button>
                {isAuthenticated && (
                  <Link href="/account/appointments" className="oryx-btn">
                    {t('account.appointments')}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow={t('nav.book')}
        title={t('booking.title')}
        subtitle={t('booking.subtitle')}
        image="/media/hero-maintenance.jpg"
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('nav.book') }]}
      />

      <section className="oryx-section">
        <div className="oryx-container">
          <div className="oryx-wizard">
            <aside className="oryx-steps" aria-label={t('booking.summary')}>
              {STEPS.map((label, index) => (
                <div
                  key={label}
                  className="oryx-step"
                  data-state={index === step ? 'active' : index < step ? 'done' : 'idle'}
                >
                  <span className="oryx-step-num">{index + 1}</span>
                  <span>
                    <span className="oryx-step-title">{t(`booking.${label}`)}</span>
                  </span>
                </div>
              ))}
            </aside>

            <div>
              {error && (
                <div style={{ marginBottom: 16 }}>
                  <Alert>{error}</Alert>
                </div>
              )}

              {step === 0 && (
                <div className="oryx-card">
                  <h2 className="oryx-card-title">{t('booking.pickService')}</h2>
                  <div className="oryx-choice-grid" style={{ marginTop: 16 }}>
                    {services.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="oryx-choice"
                        aria-pressed={serviceKey === item.key}
                        onClick={() => {
                          setServiceKey(item.key);
                          setBranchId('');
                        }}
                        data-testid={`service-${item.key}`}
                      >
                        <strong>{locale === 'ar' ? item.nameAr : item.nameEn}</strong>
                        <span>
                          {item.durationMinutes} {t('booking.minutes')}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="oryx-card">
                  <h2 className="oryx-card-title">{t('booking.pickBranch')}</h2>
                  <div className="oryx-choice-grid" style={{ marginTop: 16 }}>
                    {eligibleBranches.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="oryx-choice"
                        aria-pressed={branchId === item.id}
                        onClick={() => setBranchId(item.id)}
                        data-testid={`branch-${item.code}`}
                      >
                        <strong>{locale === 'ar' ? item.nameAr : item.nameEn}</strong>
                        <span>{item.addressLine}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="oryx-card">
                  <h2 className="oryx-card-title">{t('booking.pickDate')}</h2>
                  <div className="oryx-date-grid" style={{ marginTop: 16 }}>
                    {days.map((day) => {
                      const label = formatDayLabel(day, locale);
                      const info = dayAvailability.find((d) => d.date === day);
                      const closed = info ? info.slots === 0 : false;
                      return (
                        <button
                          key={day}
                          type="button"
                          className="oryx-date"
                          aria-pressed={date === day}
                          disabled={closed}
                          title={closed ? t('booking.closedDay') : undefined}
                          onClick={() => setDate(day)}
                          data-testid={`date-${day}`}
                        >
                          <span className="oryx-date-day">{label.day}</span>
                          <span className="oryx-date-num">{label.num}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="oryx-card">
                  <h2 className="oryx-card-title">{t('booking.pickTime')}</h2>
                  {slotsLoading ? (
                    <Loading label={t('booking.loadingSlots')} />
                  ) : slots.length === 0 ? (
                    <Alert>{t('booking.noSlots')}</Alert>
                  ) : (
                    <div className="oryx-slot-grid" style={{ marginTop: 16 }} data-testid="slot-grid">
                      {slots.map((item) => (
                        <button
                          key={item.startsAt}
                          type="button"
                          className="oryx-slot"
                          aria-pressed={slot?.startsAt === item.startsAt}
                          onClick={() => setSlot(item)}
                          data-testid="slot"
                        >
                          {formatTime(item.startsAt, locale)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="oryx-card">
                  <h2 className="oryx-card-title">{t('booking.details')}</h2>
                  <div className="oryx-form-grid" style={{ marginTop: 8 }}>
                    <Field label={t('booking.customerName')} required>
                      <input
                        className="oryx-input"
                        value={form.customerName}
                        onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                        data-testid="input-name"
                      />
                    </Field>
                    <Field label={t('booking.phone')} required>
                      <input
                        className="oryx-input"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        dir="ltr"
                        data-testid="input-phone"
                      />
                    </Field>
                    <Field label={`${t('booking.email')} (${t('common.optional')})`}>
                      <input
                        className="oryx-input"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        dir="ltr"
                      />
                    </Field>
                    <Field label={t('booking.make')}>
                      <input
                        className="oryx-input"
                        value={form.vehicleMake}
                        onChange={(e) => setForm({ ...form, vehicleMake: e.target.value })}
                      />
                    </Field>
                    <Field label={t('booking.model')}>
                      <input
                        className="oryx-input"
                        value={form.vehicleModel}
                        onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })}
                      />
                    </Field>
                    <Field label={t('booking.year')}>
                      <input
                        className="oryx-input"
                        inputMode="numeric"
                        value={form.vehicleYear}
                        onChange={(e) => setForm({ ...form, vehicleYear: e.target.value })}
                        dir="ltr"
                      />
                    </Field>
                    <Field label={t('booking.plate')}>
                      <input
                        className="oryx-input"
                        value={form.plateNumber}
                        onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label={t('booking.notes')}>
                    <textarea
                      className="oryx-textarea"
                      rows={3}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </Field>
                </div>
              )}

              <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {step > 0 && (
                  <Button onClick={() => setStep((s) => Math.max(0, s - 1))}>{t('common.back')}</Button>
                )}
                {step < 4 ? (
                  <Button
                    variant="primary"
                    disabled={!canAdvance}
                    onClick={() => setStep((s) => Math.min(4, s + 1))}
                    testId="booking-next"
                  >
                    {t('booking.next')}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={!canAdvance || busy}
                    onClick={() => void submit()}
                    testId="booking-confirm"
                  >
                    {busy ? t('common.loading') : t('booking.confirm')}
                  </Button>
                )}
              </div>

              <div style={{ marginTop: 24 }}>{summary}</div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
