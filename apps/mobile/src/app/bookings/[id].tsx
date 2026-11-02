import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Chip,
  DetailRow,
  Divider,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { localizeDigits, slotLabel, toDateParam, upcomingDays, formatDayChip } from '../../lib/format';

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
/** A booking may be moved while it is still live; a closed one may not. */
const RESCHEDULABLE = new Set(['HELD', 'CONFIRMED', 'RESCHEDULED']);

export default function LiveBookingDetail() {
  const { t, theme, locale, direction } = useApp();
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

  // Reschedule state. The date drives a fresh availability read; the slot is a
  // real engine slot, never a synthesised one.
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(toDateParam(new Date()));
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const days = useMemo(() => upcomingDays(14), []);

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

  /** Opens the reschedule sheet and loads the first day's real slots. */
  const openReschedule = async () => {
    setRescheduleError(null);
    setRescheduleTime('');
    setRescheduling(true);
    await live.loadSlots({ date: rescheduleDate, durationMinutes: booking?.durationMinutes ?? 60 });
  };

  const changeRescheduleDate = async (next: string) => {
    setRescheduleDate(next);
    setRescheduleTime('');
    await live.loadSlots({ date: next, durationMinutes: booking?.durationMinutes ?? 60 });
  };

  const submitReschedule = async () => {
    if (!booking) return;
    const selected = live.slots.find((slot) => slotLabel(slot.startsAt) === rescheduleTime);
    if (!selected) {
      setRescheduleError(t('chooseTime'));
      return;
    }
    const result = await live.reschedule(
      booking.id,
      selected.startsAt,
      booking.durationMinutes ?? 60,
    );
    if (result.ok) {
      setRescheduling(false);
      await load();
    } else {
      setRescheduleError(
        result.error?.kind === 'offline'
          ? t('offlineBody')
          : result.error?.status === 409
            ? t('slotUnavailable')
            : t('validationFailed'),
      );
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
  const canReschedule = RESCHEDULABLE.has(booking.status) && !cancelled;

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
          value={Number.isNaN(when.getTime()) ? '—' : slotLabel(booking.startsAt)}
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

      {canReschedule && !rescheduling ? (
        <Button
          testID="live-booking-reschedule"
          title={t('rescheduleBooking')}
          variant="secondary"
          onPress={() => void openReschedule()}
        />
      ) : null}

      {rescheduling ? (
        <Card>
          <SectionLabel>{t('rescheduleBooking')}</SectionLabel>
          <Body size="caption" muted style={{ marginTop: space.xs }}>
            {t('liveModeHint')}
          </Body>
          <View style={[styles.dayRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            {days.map((day) => {
              const chip = formatDayChip(day, locale);
              return (
                <Chip
                  key={toDateParam(day)}
                  testID={`reschedule-day-${toDateParam(day)}`}
                  label={`${chip.weekday} ${chip.day}`}
                  active={rescheduleDate === toDateParam(day)}
                  onPress={() => void changeRescheduleDate(toDateParam(day))}
                />
              );
            })}
          </View>
          {live.slotsLoading ? (
            <StateView kind="loading" />
          ) : live.slots.length === 0 ? (
            <Body muted size="label" style={{ marginTop: space.sm }}>
              {t('noSlots')}
            </Body>
          ) : (
            <View style={[styles.dayRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              {live.slots.map((slot) => {
                const label = slotLabel(slot.startsAt);
                return (
                  <Chip
                    key={label}
                    testID={`reschedule-slot-${label}`}
                    label={localizeDigits(label, locale)}
                    active={rescheduleTime === label}
                    onPress={() => setRescheduleTime(label)}
                  />
                );
              })}
            </View>
          )}
          {rescheduleError ? (
            <Body size="caption" align="center" style={{ marginTop: space.sm, color: theme.danger }}>
              {rescheduleError}
            </Body>
          ) : null}
          <View style={{ height: space.sm }} />
          <Button
            testID="reschedule-submit"
            title={t('confirmReschedule')}
            loading={live.busy}
            disabled={!rescheduleTime}
            onPress={() => void submitReschedule()}
          />
          <View style={{ height: space.xs }} />
          <Button
            title={t('cancel')}
            variant="secondary"
            onPress={() => {
              setRescheduling(false);
              setRescheduleError(null);
              live.clearSlots();
            }}
          />
        </Card>
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
  dayRow: { flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
