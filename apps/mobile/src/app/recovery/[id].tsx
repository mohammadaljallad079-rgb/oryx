import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useLiveSession } from '../../lib/live-session';
import { useLiveRequests } from '../../lib/live-requests';
import { ApiError } from '../../lib/api';
import { serviceRequestToDemo } from '../../lib/api-adapters';
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

/**
 * Recovery tracking.
 *
 * In a live session this reads the caller's own service request from the API and
 * shows the server's status; cancellation goes through
 * `POST /customer/marketplace/requests/:id/cancel` and the server decides whether
 * the status permits it. In the offline demo the status advances on a timer so a
 * reviewer can watch the flow, and the screen says it is a simulation rather than
 * implying a truck is actually moving.
 */
const FLOW = ['SEARCHING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'] as const;

export default function RecoveryDetail() {
  const { t, theme, locale, dataVersion } = useApp();
  const { isLive } = useLiveSession();
  const live = useLiveRequests();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useAsync(
    async () => (isLive ? null : repository.recoveryJob(id)),
    [id, dataVersion, isLive],
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isLive) return;
    setStep(0);
    const timer = setInterval(() => setStep((s) => (s >= 3 ? s : s + 1)), 2500);
    return () => clearInterval(timer);
  }, [id, isLive]);

  async function cancelLive() {
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
    }
  }

  const liveRecord = isLive ? live.items.find((r) => r.id === id) : undefined;
  const loading = isLive ? live.loading && !liveRecord : job.loading;

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title={t('trackingTitle')} />
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (isLive ? !liveRecord : !job.data) {
    return (
      <Screen>
        <ScreenHeader title={t('trackingTitle')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const record = isLive && liveRecord ? serviceRequestToDemo(liveRecord) : job.data!;
  const known = FLOW.indexOf(record.status as (typeof FLOW)[number]);
  const status = isLive ? record.status : (FLOW[Math.max(step, known >= 0 ? known : 0)] ?? record.status);

  return (
    <Screen>
      <ScreenHeader title={record.reference} subtitle={t('trackingTitle')} />

      <Card>
        <View style={styles.headRow}>
          <Badge text={status} status={status} />
          <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.subheading }}>
            {formatMoney(record.quotedPriceMinor)}
          </Text>
        </View>
        {isLive ? null : (
          <>
            <View style={{ marginTop: space.md }}>
              <ProgressBar value={(Math.max(0, FLOW.indexOf(status as (typeof FLOW)[number])) + 1) / FLOW.length} />
            </View>
            <Body size="caption" muted style={{ marginTop: space.sm }}>
              {t('eta')}: {localizeDigits(record.etaMinutes, locale)} {t('minutes')} · {t('demoNotice')}
            </Body>
          </>
        )}
      </Card>

      <Card>
        <SectionLabel>{t('driverInfo')}</SectionLabel>
        <Divider />
        {isLive ? (
          <>
            <DetailRow
              label={t('serviceProviders')}
              value={
                liveRecord?.provider
                  ? locale === 'ar'
                    ? liveRecord.provider.nameAr
                    : liveRecord.provider.nameEn
                  : t('searchingDriver')
              }
            />
            {liveRecord?.provider?.phone ? (
              <>
                <DetailRow label={t('phone')} value={liveRecord.provider.phone} />
                <View style={{ marginTop: space.md }}>
                  <Button
                    title={t('callDriver')}
                    variant="secondary"
                    onPress={() => Linking.openURL(`tel:${liveRecord.provider?.phone ?? ''}`)}
                  />
                </View>
              </>
            ) : null}
          </>
        ) : (
          <>
            <DetailRow label={t('driverAssigned')} value={locale === 'ar' ? record.driverNameAr : record.driverNameEn} />
            <DetailRow label={t('phone')} value={record.driverPhone} />
            <DetailRow label={t('truckInfo')} value={locale === 'ar' ? record.truckTypeAr : record.truckTypeEn} />
            <DetailRow label={t('plate')} value={record.truckPlate} />
            <View style={{ marginTop: space.md }}>
              <Button title={t('callDriver')} variant="secondary" onPress={() => Linking.openURL(`tel:${record.driverPhone}`)} />
            </View>
          </>
        )}
      </Card>

      {/* The live map with a moving truck is a demo simulation only; the live
          session shows the real status and provider instead. */}
      {isLive ? null : (
        <Card>
          <SectionLabel>{t('trackTruck')}</SectionLabel>
          <View style={[styles.map, { borderColor: theme.border, backgroundColor: theme.surfaceRaised }]}>
            <View style={[styles.pin, { left: `${record.pickupPoint.x}%`, top: `${record.pickupPoint.y}%`, backgroundColor: theme.textMuted }]} />
            <View style={[styles.pin, { left: `${record.dropoffPoint.x}%`, top: `${record.dropoffPoint.y}%`, backgroundColor: theme.gold }]} />
            <Text style={{ color: theme.textMuted, fontSize: typography.caption, position: 'absolute', bottom: space.sm, left: space.sm }}>
              {t('demoData')}
            </Text>
          </View>
        </Card>
      )}

      <Card>
        <SectionLabel>{t('pickupLocation')}</SectionLabel>
        {isLive ? (
          <Body size="label" style={{ marginTop: space.sm }}>
            {liveRecord?.description ?? '—'}
          </Body>
        ) : (
          <>
            <DetailRow label={t('pickupLocation')} value={locale === 'ar' ? record.pickupAr : record.pickupEn} />
            <DetailRow label={t('dropoffLocation')} value={locale === 'ar' ? record.dropoffAr : record.dropoffEn} />
          </>
        )}
        <DetailRow label={t('requestRecovery')} value={formatDateTime(record.requestedAt)} />
      </Card>

      {notice ? (
        <Body size="caption" align="center" style={{ color: theme.danger }}>
          {notice}
        </Body>
      ) : null}

      {isLive ? (
        <Button
          title={t('cancelRequest')}
          variant="danger"
          disabled={busy}
          onPress={() => void cancelLive()}
        />
      ) : (
        <>
          <Button title={t('rateDriver')} variant="secondary" onPress={() => setStep(4)} />
          <View style={{ height: space.md }} />
          <Button title={t('cancelRequest')} variant="danger" onPress={() => setStep(0)} />
        </>
      )}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  map: { height: 180, borderRadius: radius.lg, borderWidth: 1, marginTop: space.md, overflow: 'hidden' },
  pin: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
});
