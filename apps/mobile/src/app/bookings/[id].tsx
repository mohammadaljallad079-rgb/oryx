import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { useLiveSession } from '../../lib/live-session';
import { useLiveBookings } from '../../lib/live-bookings';
import { ApiError, bookingsApi, type BookingSummary } from '../../lib/api';
import { ScreenHeader } from '../../components/brand';
import {
  Badge,
  Body,
  Button,
  Card,
  DetailRow,
  Divider,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';

/**
 * Live booking detail.
 *
 * Reads one booking from the API, which scopes by the signed-in account, so a
 * booking id that belongs to someone else returns not-found rather than data.
 *
 * Cancellation is offered only while the server says it is allowed: the button
 * is hidden for a booking the API would refuse, and the request carries the
 * caller's own token, so the rule lives on the server and the UI merely reflects
 * it. The reason field is optional.
 */
const CANCELLABLE = new Set(['HELD', 'CONFIRMED', 'RESCHEDULED']);

export default function LiveBookingDetail() {
  const { t, theme, locale } = useApp();
  const { isLive } = useLiveSession();
  const live = useLiveBookings();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const load = useCallback(async () => {
    if (!id || !isLive) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Read the single booking rather than paging the whole history and
      // searching it: the endpoint scopes by the signed-in account, so a foreign
      // id is a 404 rather than a hit, and the detail projection carries the
      // resource and branch the list omits.
      const found = await bookingsApi.get(id);
      setBooking(found);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError && err.kind === 'offline'
          ? t('offlineBody')
          : err instanceof ApiError && err.kind === 'not-found'
            ? t('noResults')
            : t('loadFailed'),
      );
    } finally {
      setLoading(false);
    }
  }, [id, isLive, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async () => {
    if (!booking || cancelling) return;
    setCancelling(true);
    const result = await live.cancel(booking.id);
    setCancelling(false);
    if (result.ok) {
      setCancelled(true);
      setBooking((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
    } else {
      setError(t('loadFailed'));
    }
  };

  const confirm = async () => {
    if (!booking || confirming) return;
    setConfirming(true);
    const result = await live.confirmBooking(booking.id);
    setConfirming(false);
    if (result.ok) {
      setBooking((prev) => (prev ? { ...prev, status: 'CONFIRMED', holdExpiresAt: null } : prev));
    } else {
      setError(t('loadFailed'));
    }
  };

  if (!isLive) {
    return (
      <Screen>
        <ScreenHeader title={t('bookingDetails')} />
        <StateView kind="empty" message={t('signInRequired')} />
        <Button title={t('signIn')} onPress={() => router.replace('/login')} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title={t('bookingDetails')} />
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (!booking) {
    return (
      <Screen>
        <ScreenHeader title={t('bookingDetails')} />
        <StateView kind="error" message={error ?? t('noResults')} />
      </Screen>
    );
  }

  const when = new Date(booking.startsAt);
  const canCancel = CANCELLABLE.has(booking.status) && !cancelled;
  const canConfirm = booking.status === 'HELD';

  return (
    <Screen>
      <ScreenHeader title={t('bookingDetails')} />

      <Card>
        <View style={styles.titleRow}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.heading, flexShrink: 1 }}>
            {booking.reference ?? booking.bookingType}
          </Text>
          <Badge text={booking.status} status={booking.status} />
        </View>
        <Divider />
        <DetailRow label={t('status')} value={booking.status} />
        <DetailRow
          label={t('chooseDate')}
          value={Number.isNaN(when.getTime()) ? booking.startsAt : when.toISOString().slice(0, 10)}
        />
        <DetailRow
          label={t('chooseTime')}
          value={
            Number.isNaN(when.getTime())
              ? '—'
              : `${String(when.getUTCHours()).padStart(2, '0')}:${String(when.getUTCMinutes()).padStart(2, '0')}`
          }
        />
        {booking.durationMinutes ? (
          <DetailRow label={t('duration')} value={`${localizeDigits(booking.durationMinutes, locale)} ${t('minutes')}`} />
        ) : null}
        {booking.serviceRef ? <DetailRow label={t('chooseService')} value={booking.serviceRef} /> : null}
        {booking.notes ? <DetailRow label={t('notes')} value={booking.notes} /> : null}
      </Card>

      <Card>
        <SectionLabel>{t('liveMode')}</SectionLabel>
        <Body size="caption" muted style={{ marginTop: space.xs }}>
          {t('liveModeHint')}
        </Body>
      </Card>

      {canConfirm ? (
        <Button
          testID="live-booking-confirm"
          title={t('confirmBooking')}
          loading={confirming}
          onPress={confirm}
        />
      ) : null}

      {cancelled ? (
        <Card>
          <Body size="label" style={{ color: theme.gold }}>
            {t('bookingCancelled')}
          </Body>
        </Card>
      ) : canCancel ? (
        <Button
          testID="live-booking-cancel"
          title={t('cancelBooking')}
          variant="danger"
          loading={cancelling}
          onPress={cancel}
        />
      ) : (
        <Body size="caption" muted align="center">
          {t('cannotCancel')}
        </Body>
      )}

      <View style={{ height: space.sm }} />
      <Button title={t('myBookings')} variant="secondary" onPress={() => router.replace('/(tabs)/bookings')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
