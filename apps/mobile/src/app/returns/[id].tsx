import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { useLiveSession } from '../../lib/live-session';
import { ApiError, returnsApi } from '../../lib/api';
import { useAsync } from '../../lib/use-async';
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
import { formatDateTime, localizeDigits } from '../../lib/format';

/**
 * One return (P4).
 *
 * Read-only except for cancelling a pending return. The status trail is the
 * server's own timestamps — requested, reviewed, received, refunded — so the
 * screen never claims a step happened that the record does not show.
 */
export default function ReturnDetail() {
  const { t, theme, locale } = useApp();
  const { isLive } = useLiveSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const record = useAsync(async () => (isLive ? returnsApi.get(id) : null), [id, isLive]);

  const cancel = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await returnsApi.cancel(id);
      await record.reload();
    } catch (err) {
      setNotice(
        err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('cancelNotAllowed'),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, id, record, t]);

  if (record.loading) {
    return (
      <Screen>
        <ScreenHeader title={t('returnsTitle')} />
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!record.data) {
    return (
      <Screen>
        <ScreenHeader title={t('returnsTitle')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const row = record.data;

  return (
    <Screen>
      <ScreenHeader title={row.reference} subtitle={t('returnsTitle')} />

      <Card>
        <View style={styles.head}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.subheading }}>
            {row.orderReference ?? row.orderId}
          </Text>
          <Badge text={row.status} status={row.status} />
        </View>
        <Divider />
        <DetailRow label={t('returnReason')} value={row.reason} />
        <DetailRow label={t('returnRequested')} value={formatDateTime(row.requestedAt)} />
        {row.reviewedAt ? <DetailRow label={t('returnReviewed')} value={formatDateTime(row.reviewedAt)} /> : null}
        {row.receivedAt ? <DetailRow label={t('returnReceived')} value={formatDateTime(row.receivedAt)} /> : null}
        {row.refundedAt ? <DetailRow label={t('returnRefunded')} value={formatDateTime(row.refundedAt)} /> : null}
        {row.reviewNote ? <DetailRow label={t('returnReviewNote')} value={row.reviewNote} /> : null}
      </Card>

      <Card>
        <SectionLabel>{t('returnsLines')}</SectionLabel>
        {row.lines.map((line) => (
          <View key={line.id} style={styles.line}>
            <Text style={{ color: theme.textMuted, fontSize: typography.label, flex: 1 }}>{line.productId}</Text>
            <Text style={{ color: theme.text, fontSize: typography.label }}>
              {`×${localizeDigits(line.quantity, locale)}`}
            </Text>
          </View>
        ))}
      </Card>

      {notice ? (
        <Body size="caption" muted style={{ marginTop: space.sm }}>
          {notice}
        </Body>
      ) : null}

      {row.cancellable ? (
        <Button title={t('cancelRequest')} variant="danger" disabled={busy} onPress={() => void cancel()} />
      ) : null}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.xs },
});
