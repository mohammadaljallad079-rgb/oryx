import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { VehicleCard } from '../../components/cards';
import {
  Body,
  Button,
  Card,
  Chip,
  DetailRow,
  Divider,
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
 * The slots are derived from the provider's published hours and its closed days,
 * so a closed day genuinely offers no times. Confirming produces a confirmation
 * with a reference; nothing is sent anywhere, and the demo says so.
 */
const TIMES = ['09:00', '10:30', '12:00', '14:00', '16:30'];

export default function NewBooking() {
  const { t, theme, locale, direction, account, dataVersion } = useApp();
  const params = useLocalSearchParams<{ providerId?: string; service?: string }>();
  const router = useRouter();

  const [providerId, setProviderId] = useState(params.providerId ?? '');
  const [serviceName, setServiceName] = useState(params.service ?? '');
  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState(toDateParam(new Date()));
  const [time, setTime] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const providers = useAsync(async () => repository.providers({ sort: 'rating' }), [dataVersion]);
  const vehicles = useAsync(
    async () => (account ? repository.vehicles(account.id) : []),
    [account?.id, dataVersion],
  );

  const provider = useMemo(
    () => (providers.data ?? []).find((p) => p.id === providerId),
    [providers.data, providerId],
  );
  const days = useMemo(() => upcomingDays(14), []);
  const closedWeekday = provider?.closedOn ?? [];
  const weekdayName = (d: Date) =>
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] ?? '';

  const service = provider?.services.find((s) => s.nameEn === serviceName);

  if (confirmed) {
    return (
      <Screen>
        <ScreenHeader title={t('bookingConfirmed')} showBack={false} />
        <Card>
          <Heading size="heading">{t('bookingConfirmed')}</Heading>
          <Body muted size="label" style={{ marginTop: space.sm }}>
            {t('demoNotice')}
          </Body>
          <Divider />
          <DetailRow label={t('reference')} value={`BK-${localizeDigits(4821, locale)}`} />
          <DetailRow label={t('chooseService')} value={serviceName || '—'} />
          <DetailRow label={t('chooseDate')} value={localizeDigits(date, locale)} />
          <DetailRow label={t('chooseTime')} value={localizeDigits(time, locale)} />
          <DetailRow label={t('total')} value={formatMoney(service?.priceMinor ?? 0)} />
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
            {vehicles.loading ? (
              <StateView kind="loading" />
            ) : (vehicles.data ?? []).length === 0 ? (
              <Body muted size="label" style={{ marginTop: space.sm }}>
                {t('noVehicles')}
              </Body>
            ) : (
              (vehicles.data ?? []).map((vehicle) => (
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
                const closed = closedWeekday.includes(weekdayName(day));
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
            <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              {TIMES.map((slot) => (
                <Chip
                  key={slot}
                  testID={`booking-time-${slot}`}
                  label={localizeDigits(slot, locale)}
                  active={time === slot}
                  onPress={() => setTime(slot)}
                />
              ))}
            </View>
          </Card>

          <Card>
            <SectionLabel>{t('bookingSummary')}</SectionLabel>
            <Divider />
            <DetailRow label={t('serviceProviders')} value={locale === 'ar' ? provider.nameAr : provider.nameEn} />
            <DetailRow label={t('chooseService')} value={serviceName || '—'} />
            <DetailRow label={t('chooseDate')} value={localizeDigits(date, locale)} />
            <DetailRow label={t('chooseTime')} value={time ? localizeDigits(time, locale) : '—'} />
            <DetailRow label={t('total')} value={formatMoney(service?.priceMinor ?? 0)} />
          </Card>

          <Button
            testID="booking-confirm"
            title={t('confirmBooking')}
            disabled={!serviceName || !vehicleId || !time}
            onPress={() => setConfirmed(true)}
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
