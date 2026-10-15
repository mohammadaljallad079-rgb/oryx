import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../../lib/app-context';
import { api, ApiError, type BookingSlot } from '../../../lib/api';
import { useAsync } from '../../../lib/use-async';
import { Badge, Body, Button, Card, DetailRow, Heading, Screen, StateView } from '../../../components/ui';
import { space } from '../../../lib/theme';
import { formatDateTime } from '../../../lib/format';

/** Booking list with reschedule-by-cancel and cancellation. */
export default function BookingsScreen() {
  const { t } = useApp();
  const router = useRouter();
  const bookings = useAsync(() => api.bookings(), []);

  const upcoming = (bookings.data?.items ?? []).filter(
    (booking) => new Date(booking.startsAt).getTime() >= Date.now() && booking.status !== 'CANCELLED',
  );
  const past = (bookings.data?.items ?? []).filter(
    (booking) => new Date(booking.startsAt).getTime() < Date.now() || booking.status === 'CANCELLED',
  );

  return (
    <Screen>
      <View style={styles.actions}>
        <Button
          title={t('bookInspection')}
          onPress={() => router.push('/(app)/bookings/new?type=INSPECTION')}
        />
        <Button
          title={t('bookMaintenance')}
          variant="secondary"
          onPress={() => router.push('/(app)/bookings/new?type=MAINTENANCE')}
        />
      </View>

      {bookings.loading ? (
        <StateView kind="loading" />
      ) : bookings.error ? (
        <StateView kind="error" message={bookings.error} onRetry={bookings.reload} />
      ) : (
        <>
          <Heading>{t('upcomingBookings')}</Heading>
          {upcoming.length === 0 ? (
            <Card>
              <Body muted>{t('noBookings')}</Body>
            </Card>
          ) : (
            upcoming.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onChanged={bookings.reload} />
            ))
          )}

          {past.length > 0 ? (
            <>
              <Heading>{t('serviceHistory')}</Heading>
              {past.map((booking) => (
                <BookingCard key={booking.id} booking={booking} onChanged={bookings.reload} />
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function BookingCard({ booking, onChanged }: { booking: BookingSlot; onChanged: () => void }) {
  const { t, theme } = useApp();
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancellable =
    booking.status !== 'CANCELLED' && new Date(booking.startsAt).getTime() > Date.now();

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelBooking(booking.id, 'Cancelled by customer in the mobile app');
      setCancelling(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={styles.row}>
        <Text style={{ color: theme.text, fontWeight: '700' }}>{booking.reference}</Text>
        <Badge text={booking.status} status={booking.status} />
      </View>
      <View style={{ height: space.sm }} />
      <DetailRow label={t('date')} value={formatDateTime(booking.startsAt)} />
      <DetailRow label={t('category')} value={booking.bookingType} />
      <DetailRow label={t('duration')} value={`${booking.durationMinutes} min`} />
      {booking.cancellationReason ? (
        <DetailRow label={t('cancelReason')} value={booking.cancellationReason} />
      ) : null}
      {error ? <Text style={{ color: theme.danger, marginTop: space.sm }}>{error}</Text> : null}

      {cancellable ? (
        <View style={{ marginTop: space.md }}>
          {cancelling ? (
            <View style={styles.actions}>
              <Button title={t('confirm')} variant="danger" onPress={cancel} loading={busy} />
              <Button title={t('close')} variant="ghost" onPress={() => setCancelling(false)} />
            </View>
          ) : (
            <Button title={t('cancelBooking')} variant="danger" onPress={() => setCancelling(true)} />
          )}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: space.sm, marginBottom: space.md, flexWrap: 'wrap' },
});
