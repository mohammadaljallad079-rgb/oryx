import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useLiveSession } from '../../lib/live-session';
import { useLiveRecovery } from '../../lib/live-recovery';
import { ApiError } from '../../lib/api';
import { ScreenHeader } from '../../components/brand';
import {
  Badge,
  Body,
  Button,
  Card,
  DetailRow,
  Divider,
  ProgressBar,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { formatDateTime, formatMoney, localizeDigits } from '../../lib/format';
import type { RecoveryRequestDto } from '@oryx/shared';

/**
 * Recovery tracking.
 *
 * In a live session this polls the real recovery request
 * (`GET /customer/recovery/:id`) and shows the server's own status and its
 * append-only timeline. The status is never advanced locally: each step shown is
 * an event the server actually recorded, with the actor and instant it recorded.
 * Cancellation goes through the API and the server decides whether the status
 * permits it.
 *
 * In the offline demo the status advances on a timer so a reviewer can watch the
 * flow, and the screen says it is a simulation rather than implying a truck is
 * actually moving.
 */
const FLOW = ['SEARCHING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'] as const;
/** How often an open live job is re-read, so the timeline moves without a manual refresh. */
const POLL_MS = 15_000;

export default function RecoveryDetail() {
  const { t, theme, locale, dataVersion } = useApp();
  const { isLive } = useLiveSession();
  const live = useLiveRecovery();
  const { id } = useLocalSearchParams<{ id: string }>();

  const job = useAsync(
    async () => (isLive ? null : repository.recoveryJob(id)),
    [id, dataVersion, isLive],
  );

  const [record, setRecord] = useState<RecoveryRequestDto | null>(null);
  const [loading, setLoading] = useState(isLive);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The live record is re-read on open and then polled while the job is open, so
  // a status change made by the provider appears without the customer reloading.
  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    const read = async () => {
      const row = await live.track(id);
      if (cancelled) return;
      setRecord(row);
      setLoading(false);
    };
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, isLive, live]);

  useEffect(() => {
    if (isLive) return;
    setStep(0);
    const timer = setInterval(() => setStep((s) => (s >= 3 ? s : s + 1)), 2500);
    return () => clearInterval(timer);
  }, [id, isLive]);

  const cancelLive = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const result = await live.cancel(id, t('cancelRequest'));
    setBusy(false);
    if (!result.ok) {
      setNotice(
        result.error instanceof ApiError && result.error.kind === 'offline'
          ? t('offlineBody')
          : t('cancelNotAllowed'),
      );
      return;
    }
    const row = await live.track(id);
    setRecord(row);
  }, [busy, id, live, t]);

  if (isLive ? loading && !record : job.loading) {
    return (
      <Screen>
        <ScreenHeader title={t('trackingTitle')} />
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (isLive ? !record : !job.data) {
    return (
      <Screen>
        <ScreenHeader title={t('trackingTitle')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  if (isLive && record) {
    return (
      <Screen>
        <ScreenHeader title={record.reference} subtitle={t('trackingTitle')} />

        <Card>
          <View style={styles.headRow}>
            <Badge text={record.status} status={record.status} />
            <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
              {record.urgency}
            </Text>
          </View>
          <Body size="label" style={{ marginTop: space.sm }}>
            {record.issue}
          </Body>
        </Card>

        <Card>
          <SectionLabel>{t('driverInfo')}</SectionLabel>
          <Divider />
          <DetailRow
            label={t('serviceProviders')}
            value={record.provider ? record.provider.name : t('searchingDriver')}
          />
          {record.provider?.phone ? (
            <>
              <DetailRow label={t('phone')} value={record.provider.phone} />
              <View style={{ marginTop: space.md }}>
                <Button
                  title={t('callDriver')}
                  variant="secondary"
                  onPress={() => Linking.openURL(`tel:${record.provider?.phone ?? ''}`)}
                />
              </View>
            </>
          ) : null}
        </Card>

        <Card>
          <SectionLabel>{t('pickupLocation')}</SectionLabel>
          <DetailRow label={t('recoveryPickupPoint')} value={record.pickup.label ?? '—'} />
          <DetailRow
            label={t('recoveryCoordinates')}
            value={`${record.pickup.latitude.toFixed(5)}, ${record.pickup.longitude.toFixed(5)}`}
          />
          <DetailRow label={t('phone')} value={record.contactPhone} />
          <DetailRow label={t('requestRecovery')} value={formatDateTime(record.createdAt)} />
        </Card>

        {/* The append-only trail. Every row is an event the server wrote; the
            screen adds no status of its own. */}
        <Card>
          <SectionLabel>{t('recoveryTimeline')}</SectionLabel>
          {record.timeline.map((event) => (
            <View key={event.id} style={styles.event} testID={`recovery-event-${event.id}`}>
              <Badge text={event.status} status={event.status} />
              <View style={{ flex: 1 }}>
                {event.note ? (
                  <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{event.note}</Text>
                ) : null}
                <Text style={{ color: theme.textFaint, fontSize: typography.caption }}>
                  {`${event.actor} · ${formatDateTime(event.createdAt)}`}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        {notice ? (
          <Body size="caption" align="center" style={{ color: theme.danger }}>
            {notice}
          </Body>
        ) : null}

        {record.cancellable ? (
          <Button title={t('cancelRequest')} variant="danger" disabled={busy} onPress={() => void cancelLive()} />
        ) : null}
        <View style={{ height: space.xl }} />
      </Screen>
    );
  }

  const demo = job.data!;
  const known = FLOW.indexOf(demo.status as (typeof FLOW)[number]);
  const status = FLOW[Math.max(step, known >= 0 ? known : 0)] ?? demo.status;

  return (
    <Screen>
      <ScreenHeader title={demo.reference} subtitle={t('trackingTitle')} />

      <Card>
        <View style={styles.headRow}>
          <Badge text={status} status={status} />
          <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.subheading }}>
            {formatMoney(demo.quotedPriceMinor)}
          </Text>
        </View>
        <View style={{ marginTop: space.md }}>
          <ProgressBar value={(Math.max(0, FLOW.indexOf(status as (typeof FLOW)[number])) + 1) / FLOW.length} />
        </View>
        <Body size="caption" muted style={{ marginTop: space.sm }}>
          {t('eta')}: {localizeDigits(demo.etaMinutes, locale)} {t('minutes')} · {t('demoNotice')}
        </Body>
      </Card>

      <Card>
        <SectionLabel>{t('driverInfo')}</SectionLabel>
        <Divider />
        <DetailRow label={t('driverAssigned')} value={locale === 'ar' ? demo.driverNameAr : demo.driverNameEn} />
        <DetailRow label={t('phone')} value={demo.driverPhone} />
        <DetailRow label={t('truckInfo')} value={locale === 'ar' ? demo.truckTypeAr : demo.truckTypeEn} />
        <DetailRow label={t('plate')} value={demo.truckPlate} />
        <View style={{ marginTop: space.md }}>
          <Button title={t('callDriver')} variant="secondary" onPress={() => Linking.openURL(`tel:${demo.driverPhone}`)} />
        </View>
      </Card>

      <Card>
        <SectionLabel>{t('trackTruck')}</SectionLabel>
        <View style={[styles.map, { borderColor: theme.border, backgroundColor: theme.surfaceRaised }]}>
          <View
            style={[styles.pin, { left: `${demo.pickupPoint.x}%`, top: `${demo.pickupPoint.y}%`, backgroundColor: theme.textMuted }]}
          />
          <View
            style={[styles.pin, { left: `${demo.dropoffPoint.x}%`, top: `${demo.dropoffPoint.y}%`, backgroundColor: theme.gold }]}
          />
          <Text
            style={{
              color: theme.textMuted,
              fontSize: typography.caption,
              position: 'absolute',
              bottom: space.sm,
              left: space.sm,
            }}
          >
            {t('demoData')}
          </Text>
        </View>
      </Card>

      <Card>
        <SectionLabel>{t('pickupLocation')}</SectionLabel>
        <DetailRow label={t('pickupLocation')} value={locale === 'ar' ? demo.pickupAr : demo.pickupEn} />
        <DetailRow label={t('dropoffLocation')} value={locale === 'ar' ? demo.dropoffAr : demo.dropoffEn} />
        <DetailRow label={t('requestRecovery')} value={formatDateTime(demo.requestedAt)} />
      </Card>

      <Button title={t('rateDriver')} variant="secondary" onPress={() => setStep(4)} />
      <View style={{ height: space.md }} />
      <Button title={t('cancelRequest')} variant="danger" onPress={() => setStep(0)} />
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  map: { height: 180, borderRadius: radius.lg, borderWidth: 1, marginTop: space.md, overflow: 'hidden' },
  pin: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  event: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.xs },
});
