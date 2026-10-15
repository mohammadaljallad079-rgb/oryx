import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../../lib/app-context';
import { api } from '../../../lib/api';
import { useAsync } from '../../../lib/use-async';
import { Body, Button, Card, DetailRow, Heading, Screen, StateView } from '../../../components/ui';
import { space } from '../../../lib/theme';
import { formatDate } from '../../../lib/format';

/**
 * Vehicle service history.
 *
 * The API returns a mixed feed of bookings, inspections and workshop jobs for one
 * vehicle; each entry is rendered generically because the record shapes differ by
 * source module.
 */
export default function VehicleHistoryScreen() {
  const { t, theme } = useApp();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const vehicle = useAsync(() => api.vehicle(id), [id]);
  const history = useAsync(() => api.vehicleHistory(id), [id]);

  return (
    <Screen>
      {vehicle.loading ? (
        <StateView kind="loading" />
      ) : vehicle.error ? (
        <StateView kind="error" message={vehicle.error} onRetry={vehicle.reload} />
      ) : vehicle.data ? (
        <Card>
          <Heading>
            {vehicle.data.make} {vehicle.data.model}
          </Heading>
          <DetailRow label={t('year')} value={String(vehicle.data.modelYear)} />
          <DetailRow label={t('vin')} value={vehicle.data.vin} />
          {vehicle.data.plateNumber ? (
            <DetailRow label={t('plate')} value={vehicle.data.plateNumber} />
          ) : null}
          <DetailRow label={t('mileage')} value={String(vehicle.data.mileage)} />
        </Card>
      ) : null}

      <Heading>{t('serviceHistory')}</Heading>
      {history.loading ? (
        <StateView kind="loading" />
      ) : history.error ? (
        <StateView kind="error" message={history.error} onRetry={history.reload} />
      ) : (history.data?.items ?? []).length === 0 ? (
        <Card>
          <Body muted>{t('none')}</Body>
        </Card>
      ) : (
        (history.data?.items ?? []).map((entry, index) => (
          <Card key={String(entry.id ?? index)}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>
              {String(entry.title ?? entry.kind ?? entry.reference ?? t('serviceHistory'))}
            </Text>
            <View style={{ height: space.sm }} />
            {entry.occurredAt ? (
              <DetailRow label={t('date')} value={formatDate(String(entry.occurredAt))} />
            ) : null}
            {entry.status ? <DetailRow label={t('status')} value={String(entry.status)} /> : null}
            {entry.summary ? (
              <DetailRow label={t('describeIssue')} value={String(entry.summary)} />
            ) : null}
          </Card>
        ))
      )}

      <Button
        title={t('bookMaintenance')}
        onPress={() => router.push(`/(app)/bookings/new?type=MAINTENANCE&vehicleId=${id}`)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({});
