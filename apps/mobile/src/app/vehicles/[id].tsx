import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { BookingCard, ReportCard } from '../../components/cards';
import {
  Body,
  Button,
  Card,
  DetailRow,
  Divider,
  Photo,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';

/**
 * A vehicle.
 *
 * The car's details plus everything that has happened to it: its reports and its
 * bookings. This is the screen that makes the demo feel connected — the same
 * vehicle appears in the garage, in the SENSAGE report and in the booking.
 */
export default function VehicleDetail() {
  const { t, theme, locale, account, direction, dataVersion } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const vehicle = useAsync(async () => repository.vehicle(id), [id, dataVersion]);
  const reports = useAsync(
    async () => (account ? repository.sensageReports(account.id) : []),
    [account?.id, dataVersion],
  );
  const bookings = useAsync(
    async () => (account ? repository.bookings(account.id) : []),
    [account?.id, dataVersion],
  );

  if (vehicle.loading) {
    return (
      <Screen>
        <ScreenHeader title={t('myVehicles')} />
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!vehicle.data) {
    return (
      <Screen>
        <ScreenHeader title={t('myVehicles')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const car = vehicle.data;
  const carReports = (reports.data ?? []).filter((r) => r.vehicleId === car.id);
  const carBookings = (bookings.data ?? []).filter((b) => b.vehicleId === car.id);

  return (
    <Screen>
      <ScreenHeader title={`${car.make} ${car.model}`} subtitle={car.plate} />
      <Photo source={photo(car.photo)} height={180} width="100%" radiusValue={radius.lg} />

      <View style={{ height: space.md }} />
      <Card>
        <DetailRow label={t('make')} value={car.make} />
        <DetailRow label={t('model')} value={car.model} />
        <DetailRow label={t('year')} value={localizeDigits(car.year, locale)} />
        <DetailRow label={t('plate')} value={car.plate} />
        <DetailRow label={t('vin')} value={car.vin} />
        <DetailRow label={t('colour')} value={locale === 'ar' ? car.colourAr : car.colourEn} />
        <DetailRow
          label={t('mileage')}
          value={`${localizeDigits(car.mileageKm.toLocaleString('en-US'), locale)} ${locale === 'ar' ? 'كم' : 'km'}`}
        />
      </Card>

      <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
        <View style={{ flex: 1 }}>
          <Button title={t('startAnalysis')} onPress={() => router.push('/sensage/new')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={t('bookNow')} variant="secondary" onPress={() => router.push('/services')} />
        </View>
      </View>

      <SectionLabel>{t('myReports')}</SectionLabel>
      {carReports.length === 0 ? (
        <Body size="label" muted>
          {t('noReports')}
        </Body>
      ) : (
        carReports.map((report) => <ReportCard key={report.id} report={report} vehicle={car} />)
      )}

      <SectionLabel>{t('myBookings')}</SectionLabel>
      {carBookings.length === 0 ? (
        <Body size="label" muted>
          {t('noBookings')}
        </Body>
      ) : (
        carBookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} provider={repository.provider(booking.providerId)} />
        ))
      )}

      <Divider />
      <Text style={{ color: theme.textFaint, fontSize: typography.caption, textAlign: 'center' }}>
        {t('demoData')}
      </Text>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, marginVertical: space.md },
});
