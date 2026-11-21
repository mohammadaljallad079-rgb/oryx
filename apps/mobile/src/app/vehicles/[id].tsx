import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useLiveSession } from '../../lib/live-session';
import { vehiclesApi, type CustomerVehicleHistory } from '../../lib/api';
import { customerVehicleToDemo } from '../../lib/api-adapters';
import { ScreenHeader } from '../../components/brand';
import { ReportCard } from '../../components/cards';
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
import { formatDate, localizeDigits } from '../../lib/format';

/**
 * A vehicle.
 *
 * Inside a live session the car and its history are the server's: the vehicle is
 * read from the customer's own garage and the history comes from
 * `GET /customer/vehicles/:id/history`, which assembles the real inspections,
 * maintenance bookings, workshop job cards and warranties. Offline, the same
 * screen reads the local demo records.
 */
export default function VehicleDetail() {
  const { t, theme, locale, account, direction, dataVersion } = useApp();
  const { isLive } = useLiveSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const demoVehicle = useAsync(
    async () => (isLive ? null : repository.vehicle(id)),
    [id, dataVersion, isLive],
  );
  const liveVehicle = useAsync(
    async () => (isLive ? (await vehiclesApi.list()).find((v) => v.id === id) ?? null : null),
    [id, dataVersion, isLive],
  );
  const history = useAsync(
    async (): Promise<CustomerVehicleHistory | null> => (isLive ? vehiclesApi.history(id) : null),
    [id, dataVersion, isLive],
  );
  const reports = useAsync(
    async () => (account && !isLive ? repository.sensageReports(account.id) : []),
    [account?.id, dataVersion, isLive],
  );

  const vehicleLoading = isLive ? liveVehicle.loading : demoVehicle.loading;
  const vehicleData = isLive
    ? liveVehicle.data
      ? customerVehicleToDemo(liveVehicle.data)
      : null
    : demoVehicle.data;

  if (vehicleLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('myVehicles')} />
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!vehicleData) {
    return (
      <Screen>
        <ScreenHeader title={t('myVehicles')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const car = vehicleData;
  const carReports = (reports.data ?? []).filter((r) => r.vehicleId === car.id);

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

      {isLive ? (
        <>
          <SectionLabel>{t('serviceHistory')}</SectionLabel>
          {history.loading ? (
            <StateView kind="loading" />
          ) : (
            (() => {
              const h = history.data;
              const rows = h
                ? [
                    ...h.inspections.map((r) => ({
                      id: r.id,
                      title: `${t('inspection')} · ${r.bookingNumber}`,
                      status: r.status,
                      at: r.scheduledAt ?? r.createdAt,
                    })),
                    ...h.maintenance.map((r) => ({
                      id: r.id,
                      title: `${t('maintenance')} · ${r.bookingNumber}`,
                      status: r.status,
                      at: r.scheduledAt ?? r.createdAt,
                    })),
                    ...h.jobCards.map((r) => ({
                      id: r.id,
                      title: `${t('workOrders')} · ${r.jobNumber}`,
                      status: r.status,
                      at: r.completedAt ?? r.createdAt,
                    })),
                  ]
                : [];
              if (rows.length === 0) {
                return (
                  <Body size="label" muted>
                    {t('noHistory')}
                  </Body>
                );
              }
              return rows.map((row) => (
                <Card key={row.id}>
                  <View style={styles.row}>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.label, flex: 1 }}>
                      {row.title}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: typography.caption }}>
                      {formatDate(row.at)}
                    </Text>
                  </View>
                </Card>
              ));
            })()
          )}
        </>
      ) : (
        <>
          <SectionLabel>{t('myBookings')}</SectionLabel>
          <Body size="label" muted>
            {t('demoNotice')}
          </Body>
        </>
      )}

      <Divider />
      <Text style={{ color: theme.textFaint, fontSize: typography.caption, textAlign: 'center' }}>
        {isLive ? t('liveData') : t('demoData')}
      </Text>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, marginVertical: space.md },
});
