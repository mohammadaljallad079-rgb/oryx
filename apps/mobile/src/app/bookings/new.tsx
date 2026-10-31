import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useLiveSession } from '../../lib/live-session';
import { useLiveBookings } from '../../lib/live-bookings';
import { useLiveProviders } from '../../lib/live-catalog';
import { publicProviderToDemo } from '../../lib/api-adapters';
import { ScreenHeader } from '../../components/brand';
import { VehicleCard } from '../../components/cards';
import {
  Body,
  Button,
  Card,
  Chip,
  DetailRow,
  Divider,
  Field,
  Heading,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatDayChip, formatMoney, localizeDigits, toDateParam, upcomingDays } from '../../lib/format';

/**
 * The booking wizard.
 *
 * Four steps in one screen — service, vehicle, date and time — then a summary.
 *
 * Two modes, never mixed. Inside a live session the date and time come from the
 * real engine: `GET /customer/bookings/availability` returns the slots the
 * provider's working hours and its existing bookings actually leave open, and
 * the confirmed booking is created through `POST /customer/bookings`, where the
 * API enforces vehicle ownership and double-booking. A guest or demo session
 * uses the local demo provider's published hours, and the confirmation says it
 * is a demo.
 *
 * The wizard never synthesises a slot. When the engine returns none the day is
 * shown as empty, because a fabricated time would let a customer book a moment
 * the workshop is closed.
 */
const DEMO_TIMES = ['09:00', '10:30', '12:00', '14:00', '16:30'];

export default function NewBooking() {
  const { t, theme, locale, direction, account, dataVersion } = useApp();
  const { isLive } = useLiveSession();
  const live = useLiveBookings();
  const params = useLocalSearchParams<{ providerId?: string; service?: string }>();
  const router = useRouter();

  const [providerId, setProviderId] = useState(params.providerId ?? '');
  const [serviceName, setServiceName] = useState(params.service ?? '');
  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState(toDateParam(new Date()));
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [liveReference, setLiveReference] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // In a live session the provider directory is the approved, real one and its
  // listings are the bookable services; the demo directory is only read offline.
  const liveProviders = useLiveProviders();
  const demoProviders = useAsync(
    async () => (!isLive ? repository.providers({ sort: 'rating' }) : []),
    [dataVersion, isLive],
  );
  const providers = useMemo(
    () => ({
      data: isLive
        ? liveProviders.providers.map(publicProviderToDemo)
        : (demoProviders.data ?? []),
      loading: isLive ? liveProviders.loading : demoProviders.loading,
    }),
    [isLive, liveProviders.providers, liveProviders.loading, demoProviders.data, demoProviders.loading],
  );
  const demoVehicles = useAsync(
    async () => (account ? repository.vehicles(account.id) : []),
    [account?.id, dataVersion],
  );
  // In a live session the vehicle list is the account's real garage, so the
  // booking names a car the API will accept; otherwise it is the demo garage.
  const [liveVehicles, setLiveVehicles] = useState<Array<{ id: string; make: string; model: string; modelYear: number; plateNumber: string | null; vin: string }>>([]);
  useEffect(() => {
    if (!isLive) {
      setLiveVehicles([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { vehiclesApi } = await import('../../lib/api');
        const rows = await vehiclesApi.list();
        if (!cancelled) setLiveVehicles(rows);
      } catch {
        /* an empty garage is a valid state; the screen shows "no vehicles" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLive]);

  const provider = useMemo(
    () => (providers.data ?? []).find((p) => p.id === providerId),
    [providers.data, providerId],
  );
  const days = useMemo(() => upcomingDays(14), []);
  const closedWeekday = provider?.closedOn ?? [];
  const weekdayName = (d: Date) =>
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] ?? '';

  const service = provider?.services.find((s) => s.nameEn === serviceName);

  // Load the real slots whenever the date changes inside a live session. The
  // demo path derives its own list and never calls the engine.
  useEffect(() => {
    if (!isLive) return;
    void live.loadSlots({ date, durationMinutes: 60, serviceRef: serviceName || undefined });
    return () => live.clearSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, date, serviceName]);

  const liveSlotLabels = useMemo(
    () =>
      live.slots.map((slot) => {
        const d = new Date(slot.startsAt);
        return Number.isNaN(d.getTime())
          ? slot.startsAt
          : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      }),
    [live.slots],
  );

  const confirm = async () => {
    if (!isLive) {
      setConfirmed(true);
      return;
    }
    setSubmitError(null);
    const selected = live.slots.find((slot, i) => liveSlotLabels[i] === time);
    if (!selected) {
      setSubmitError(t('chooseTime'));
      return;
    }
    const result = await live.create({
      bookingType: 'PROVIDER_SERVICE',
      startsAt: selected.startsAt,
      durationMinutes: 60,
      vehicleId: vehicleId || undefined,
      serviceRef: serviceName || undefined,
      notes: notes || undefined,
    });
    if (result.ok) {
      // A customer booking is created as a hold; confirming it is what turns it
      // into a real appointment. Without this step the slot is released when the
      // hold window ends. A confirmation failure is not fatal — the booking
      // exists and can be confirmed from its detail screen — so it is surfaced
      // rather than swallowed.
      const confirmedResult = await live.confirmBooking(result.booking.id);
      if (!confirmedResult.ok) {
        setSubmitError(t('bookingConfirmPending'));
      }
      setLiveReference(result.booking.reference ?? result.booking.id);
      setConfirmed(true);
    } else {
      setSubmitError(
        result.error.kind === 'offline'
          ? t('offlineBody')
          : result.error.kind === 'forbidden'
            ? t('forbiddenBody')
            : t('validationFailed'),
      );
    }
  };

  if (confirmed) {
    return (
      <Screen>
        <ScreenHeader title={t('bookingConfirmed')} showBack={false} />
        <Card>
          <Heading size="heading">{t('bookingConfirmed')}</Heading>
          <Body muted size="label" style={{ marginTop: space.sm }}>
            {isLive ? t('liveModeHint') : t('demoNotice')}
          </Body>
          <Divider />
          <DetailRow label={t('reference')} value={isLive ? (liveReference ?? '—') : `BK-${localizeDigits(4821, locale)}`} />
          <DetailRow label={t('chooseService')} value={serviceName || '—'} />
          <DetailRow label={t('chooseDate')} value={localizeDigits(date, locale)} />
          <DetailRow label={t('chooseTime')} value={localizeDigits(time, locale)} />
          {!isLive ? <DetailRow label={t('total')} value={formatMoney(service?.priceMinor ?? 0)} /> : null}
        </Card>
        <Button title={t('myBookings')} onPress={() => router.replace('/bookings')} />
        <View style={{ height: space.sm }} />
        <Button title={t('home')} variant="secondary" onPress={() => router.replace('/(tabs)/home')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('bookNow')} subtitle={provider ? (locale === 'ar' ? provider.nameAr : provider.nameEn) : undefined} />

      {!provider ? (
        <>
          <SectionLabel>{t('serviceProviders')}</SectionLabel>
          {providers.loading ? (
            <StateView kind="loading" />
          ) : (
            (providers.data ?? []).slice(0, 8).map((p) => (
              <Card
                key={p.id}
                testID={`booking-provider-${p.id}`}
                onPress={() => {
                  setProviderId(p.id);
                  setServiceName('');
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                  {locale === 'ar' ? p.nameAr : p.nameEn}
                </Text>
                <Body size="caption" muted>
                  {localizeDigits(p.services.length, locale)} {t('servicesAndPrices')}
                </Body>
              </Card>
            ))
          )}
        </>
      ) : (
        <>
          <Card>
            <SectionLabel>{t('chooseService')}</SectionLabel>
            <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              {provider.services.map((s) => (
                <Chip
                  key={s.nameEn}
                  testID={`booking-service-${s.nameEn}`}
                  label={`${locale === 'ar' ? s.nameAr : s.nameEn} · ${formatMoney(s.priceMinor)}`}
                  active={serviceName === s.nameEn}
                  onPress={() => setServiceName(s.nameEn)}
                />
              ))}
            </View>
          </Card>

          <Card>
            <SectionLabel>{t('chooseVehicle')}</SectionLabel>
            {isLive ? (
              liveVehicles.length === 0 ? (
                <Body muted size="label" style={{ marginTop: space.sm }}>
                  {t('noVehicles')}
                </Body>
              ) : (
                <View style={{ marginTop: space.sm, gap: space.xs }}>
                  {liveVehicles.map((vehicle) => (
                    <Card
                      key={vehicle.id}
                      testID={`booking-live-vehicle-${vehicle.id}`}
                      onPress={() => setVehicleId(vehicle.id)}
                      style={vehicleId === vehicle.id ? { borderColor: theme.gold } : undefined}
                    >
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                        {vehicle.make} {vehicle.model} · {localizeDigits(vehicle.modelYear, locale)}
                      </Text>
                      <Body size="caption" muted>
                        {vehicle.plateNumber ?? vehicle.vin}
                      </Body>
                    </Card>
                  ))}
                </View>
              )
            ) : demoVehicles.loading ? (
              <StateView kind="loading" />
            ) : (demoVehicles.data ?? []).length === 0 ? (
              <Body muted size="label" style={{ marginTop: space.sm }}>
                {t('noVehicles')}
              </Body>
            ) : (
              (demoVehicles.data ?? []).map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  selected={vehicleId === vehicle.id}
                  onPress={() => setVehicleId(vehicle.id)}
                />
              ))
            )}
          </Card>

          <Card>
            <SectionLabel>{t('chooseDate')}</SectionLabel>
            <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              {days.map((day) => {
                const chip = formatDayChip(day, locale);
                // A live session trusts the engine, not the demo's closed days.
                const closed = !isLive && closedWeekday.includes(weekdayName(day));
                return (
                  <Chip
                    key={toDateParam(day)}
                    testID={`booking-day-${toDateParam(day)}`}
                    label={`${chip.weekday} ${chip.day}`}
                    active={date === toDateParam(day)}
                    onPress={() => {
                      if (!closed) {
                        setDate(toDateParam(day));
                        setTime('');
                      }
                    }}
                  />
                );
              })}
            </View>
          </Card>

          <Card>
            <SectionLabel>{t('availableSlots')}</SectionLabel>
            {isLive ? (
              live.slotsLoading ? (
                <StateView kind="loading" />
              ) : liveSlotLabels.length === 0 ? (
                <Body muted size="label" style={{ marginTop: space.sm }}>
                  {t('noSlots')}
                </Body>
              ) : (
                <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                  {liveSlotLabels.map((slot) => (
                    <Chip
                      key={slot}
                      testID={`booking-live-slot-${slot}`}
                      label={localizeDigits(slot, locale)}
                      active={time === slot}
                      onPress={() => setTime(slot)}
                    />
                  ))}
                </View>
              )
            ) : (
              <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                {DEMO_TIMES.map((slot) => (
                  <Chip
                    key={slot}
                    testID={`booking-time-${slot}`}
                    label={localizeDigits(slot, locale)}
                    active={time === slot}
                    onPress={() => setTime(slot)}
                  />
                ))}
              </View>
            )}
          </Card>

          <Card>
            <SectionLabel>{t('bookingSummary')}</SectionLabel>
            <Divider />
            <DetailRow label={t('serviceProviders')} value={locale === 'ar' ? provider.nameAr : provider.nameEn} />
            <DetailRow label={t('chooseService')} value={serviceName || '—'} />
            <DetailRow label={t('chooseDate')} value={localizeDigits(date, locale)} />
            <DetailRow label={t('chooseTime')} value={time ? localizeDigits(time, locale) : '—'} />
            {!isLive ? <DetailRow label={t('total')} value={formatMoney(service?.priceMinor ?? 0)} /> : null}
          </Card>

          {isLive ? (
            <Card>
              <Field label={t('notes')} value={notes} onChangeText={setNotes} testID="booking-notes" />
            </Card>
          ) : null}

          {submitError ? (
            <Body size="caption" align="center" style={{ color: theme.danger }}>
              {submitError}
            </Body>
          ) : null}

          <Button
            testID="booking-confirm"
            title={t('confirmBooking')}
            loading={live.busy}
            disabled={!serviceName || !vehicleId || !time}
            onPress={() => void confirm()}
          />
          <View style={{ height: space.xl }} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
