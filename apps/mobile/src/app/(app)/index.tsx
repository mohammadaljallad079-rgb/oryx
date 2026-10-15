import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/use-async';
import { Badge, Body, Button, Card, DetailRow, Heading, Screen, StateView } from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { formatMoney } from '../../lib/format';

/**
 * Customer dashboard.
 *
 * Every figure comes from a live endpoint — there are no placeholder counts. A
 * failure in one panel is shown in that panel rather than blanking the screen.
 */
export default function DashboardScreen() {
  const { t, theme, profile } = useApp();
  const router = useRouter();

  const vehicles = useAsync(() => api.vehicles(), []);
  const bookings = useAsync(() => api.bookings(), []);
  const payments = useAsync(() => api.payments(), []);
  const requests = useAsync(() => api.serviceRequests(), []);

  const upcoming = (bookings.data?.items ?? []).filter(
    (booking) => new Date(booking.startsAt).getTime() > Date.now() && booking.status !== 'CANCELLED',
  );
  const activeRequests = (requests.data?.items ?? []).filter(
    (request) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(request.status),
  );

  const firstName = profile?.fullName?.split(' ')[0] ?? '';

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.heroTitle, { color: theme.text }]}>
          {t('welcome')}
          {firstName ? ` ${firstName}` : ''}
        </Text>
        <Body muted>{t('dashboardSubtitle')}</Body>
      </View>

      <View style={styles.metrics}>
        <Metric
          label={t('savedVehicles')}
          value={vehicles.loading ? '—' : String(vehicles.data?.length ?? 0)}
        />
        <Metric
          label={t('upcomingBookings')}
          value={bookings.loading ? '—' : String(upcoming.length)}
        />
        <Metric
          label={t('activeRequests')}
          value={requests.loading ? '—' : String(activeRequests.length)}
        />
        <Metric
          label={t('openInvoices')}
          value={payments.loading ? '—' : String(payments.data?.total ?? 0)}
        />
      </View>

      <Heading>{t('upcomingBookings')}</Heading>
      {bookings.loading ? (
        <StateView kind="loading" />
      ) : bookings.error ? (
        <StateView kind="error" message={bookings.error} onRetry={bookings.reload} />
      ) : upcoming.length === 0 ? (
        <Card>
          <Body muted>{t('noBookings')}</Body>
        </Card>
      ) : (
        upcoming.slice(0, 3).map((booking) => (
          <Card key={booking.id} onPress={() => router.push('/(app)/bookings')}>
            <View style={styles.row}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{booking.reference}</Text>
              <Badge text={booking.status} status={booking.status} />
            </View>
            <View style={{ height: space.sm }} />
            <DetailRow label={t('date')} value={formatDateTime(booking.startsAt)} />
            <DetailRow label={t('category')} value={booking.bookingType} />
          </Card>
        ))
      )}

      <Heading>{t('bookInspection')}</Heading>
      <Card>
        <Body muted>{t('supportHint')}</Body>
        <View style={{ height: space.md }} />
        <View style={styles.actions}>
          <Button
            title={t('bookInspection')}
            onPress={() => router.push('/(app)/bookings/new?type=INSPECTION')}
            testID="cta-inspection"
          />
          <Button
            title={t('bookMaintenance')}
            variant="secondary"
            onPress={() => router.push('/(app)/bookings/new?type=MAINTENANCE')}
            testID="cta-maintenance"
          />
          <Button
            title={t('requestService')}
            variant="secondary"
            onPress={() => router.push('/(app)/services')}
            testID="cta-request"
          />
        </View>
      </Card>

      <Heading>{t('invoices')}</Heading>
      {payments.loading ? (
        <StateView kind="loading" />
      ) : payments.error ? (
        <StateView kind="error" message={payments.error} onRetry={payments.reload} />
      ) : (payments.data?.items.length ?? 0) === 0 ? (
        <Card>
          <Body muted>{t('noPayments')}</Body>
        </Card>
      ) : (
        <Card>
          {(payments.data?.items ?? []).slice(0, 3).map((payment) => (
            <DetailRow
              key={payment.id}
              label={payment.intentNumber}
              value={formatMoney(payment.amountMinor, payment.currency, payment.currencyScale)}
            />
          ))}
          <View style={{ height: space.sm }} />
          <Button title={t('invoices')} variant="ghost" onPress={() => router.push('/(app)/invoices')} />
        </Card>
      )}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { theme } = useApp();
  return (
    <View style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={{ color: theme.gold, fontSize: typography.title, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: theme.textMuted, fontSize: typography.caption }}>{label}</Text>
    </View>
  );
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  hero: { paddingVertical: space.lg },
  heroTitle: { fontSize: typography.title, fontWeight: '800', marginBottom: space.xs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.lg },
  metric: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { gap: space.sm },
});
