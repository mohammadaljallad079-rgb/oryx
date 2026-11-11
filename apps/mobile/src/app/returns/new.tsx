import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { useLiveSession } from '../../lib/live-session';
import { ApiError, ordersApi, returnsApi } from '../../lib/api';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import {
  Body,
  Button,
  Card,
  Field,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatMoney, localizeDigits } from '../../lib/format';

/**
 * Request a return on one of your orders (P4).
 *
 * The order and its lines are the server's own record, so the quantity the
 * customer may return is bounded by what was actually ordered. The window is
 * enforced server-side; this screen offers the action and reports the server's
 * refusal rather than pre-judging it.
 */
export default function NewReturn() {
  const { t, theme, locale } = useApp();
  const { isLive } = useLiveSession();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const order = useAsync(async () => (isLive ? ordersApi.get(orderId) : null), [orderId, isLive]);

  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (busy) return;
    const lines = Object.entries(picked)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderLineId, quantity]) => ({ orderLineId, quantity }));
    if (lines.length === 0) {
      setNotice(t('returnPickLines'));
      return;
    }
    if (!reason.trim()) {
      setNotice(t('returnReasonRequired'));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await returnsApi.create(orderId, { reason: reason.trim(), lines });
      setNotice(t('returnSubmitted'));
      setPicked({});
      setReason('');
    } catch (err) {
      setNotice(
        err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('returnFailed'),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, orderId, picked, reason, t]);

  if (order.loading) {
    return (
      <Screen>
        <ScreenHeader title={t('returnOrder')} />
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!order.data) {
    return (
      <Screen>
        <ScreenHeader title={t('returnOrder')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const record = order.data;

  return (
    <Screen>
      <ScreenHeader title={t('returnOrder')} subtitle={record.reference} />

      <Card>
        <SectionLabel>{t('returnPickLines')}</SectionLabel>
        {record.lines.map((line) => {
          const chosen = picked[line.id] ?? 0;
          return (
            <View key={line.id} style={styles.line} testID={`return-line-${line.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: typography.label, fontWeight: '600' }}>
                  {locale === 'ar' ? line.nameAr : line.nameEn}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: typography.caption }}>
                  {`${t('quantity')}: ${localizeDigits(line.quantity, locale)} · ${formatMoney(line.unitPriceMinor)}`}
                </Text>
              </View>
              <View style={[styles.stepper]}>
                <Button
                  testID={`return-dec-${line.id}`}
                  title="−"
                  variant="secondary"
                  disabled={chosen <= 0}
                  onPress={() => setPicked((p) => ({ ...p, [line.id]: Math.max(0, chosen - 1) }))}
                />
                <Text style={{ color: theme.text, minWidth: 28, textAlign: 'center' }}>
                  {localizeDigits(chosen, locale)}
                </Text>
                <Button
                  testID={`return-inc-${line.id}`}
                  title="+"
                  variant="secondary"
                  disabled={chosen >= line.quantity}
                  onPress={() => setPicked((p) => ({ ...p, [line.id]: Math.min(line.quantity, chosen + 1) }))}
                />
              </View>
            </View>
          );
        })}
      </Card>

      <Card>
        <Field label={t('returnReason')} value={reason} onChangeText={setReason} multiline testID="return-reason" />
        <Button
          testID="return-submit"
          title={t('returnSubmit')}
          loading={busy}
          disabled={busy}
          onPress={() => void submit()}
        />
        {notice ? (
          <Body size="caption" muted style={{ marginTop: space.sm }}>
            {notice}
          </Body>
        ) : null}
      </Card>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
