import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { statusLabel } from '../../lib/i18n';
import { useLiveSession } from '../../lib/live-session';
import { ApiError, rfqsApi } from '../../lib/api';
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
import { formatDateTime, formatMoney, localizeDigits } from '../../lib/format';

/**
 * One request for quotation (P4).
 *
 * The quotes arrive sorted cheapest-first from the server. Accepting one is
 * exclusive: the API refuses a second acceptance, so the button is offered only
 * while the RFQ has no accepted quote and the server remains the authority.
 */
export default function RfqDetail() {
  const { t, theme, locale } = useApp();
  const { isLive } = useLiveSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const rfq = useAsync(async () => (isLive ? rfqsApi.get(id) : null), [id, isLive]);

  const accept = useCallback(
    async (quoteId: string) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await rfqsApi.acceptQuote(id, quoteId);
        setNotice(t('rfqQuoteAccepted'));
        await rfq.reload();
      } catch (err) {
        setNotice(
          err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('rfqAcceptFailed'),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, id, rfq, t],
  );

  const cancel = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await rfqsApi.cancel(id);
      await rfq.reload();
    } catch (err) {
      setNotice(
        err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('cancelNotAllowed'),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, id, rfq, t]);

  if (rfq.loading) {
    return (
      <Screen>
        <ScreenHeader title={t('rfqsTitle')} />
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!rfq.data) {
    return (
      <Screen>
        <ScreenHeader title={t('rfqsTitle')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const record = rfq.data;
  const decided = record.acceptedQuoteId !== null || record.status !== 'OPEN';

  return (
    <Screen>
      <ScreenHeader title={record.reference} subtitle={t('rfqsTitle')} />

      <Card>
        <View style={styles.head}>
          <Badge text={statusLabel(locale, record.status)} status={record.status} />
          <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.subheading }}>
            {`${localizeDigits(record.quantity, locale)}`}
          </Text>
        </View>
        <Text style={{ color: theme.textMuted, fontSize: typography.label, marginTop: space.sm }}>
          {record.description}
        </Text>
        <Divider />
        <DetailRow label={t('category')} value={record.categoryKey} />
        {record.vehicle ? <DetailRow label={t('selectVehicle')} value={record.vehicle.label} /> : null}
        <DetailRow label={t('rfqCreated')} value={formatDateTime(record.createdAt)} />
        {record.expiresAt ? <DetailRow label={t('rfqExpires')} value={formatDateTime(record.expiresAt)} /> : null}
      </Card>

      <SectionLabel>{t('rfqQuotes')}</SectionLabel>
      {record.quotes.length === 0 ? (
        <StateView kind="empty" message={t('rfqNoQuotes')} />
      ) : (
        record.quotes.map((quote) => (
          <Card key={quote.id} testID={`rfq-quote-${quote.id}`}>
            <View style={styles.head}>
              <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.subheading }}>
                {formatMoney(quote.priceMinor)}
              </Text>
              {record.acceptedQuoteId === quote.id ? (
                <Badge text={t('rfqAccepted')} tone="success" />
              ) : (
                <Badge text={statusLabel(locale, quote.status)} status={quote.status} />
              )}
            </View>
            {quote.leadTimeDays !== null ? (
              <DetailRow
                label={t('rfqLeadTime')}
                value={`${localizeDigits(quote.leadTimeDays, locale)} ${t('days')}`}
              />
            ) : null}
            {quote.note ? (
              <Text style={{ color: theme.textMuted, fontSize: typography.label, marginTop: space.xs }}>
                {quote.note}
              </Text>
            ) : null}
            {!decided ? (
              <View style={{ marginTop: space.md }}>
                <Button
                  testID={`rfq-accept-${quote.id}`}
                  title={t('rfqAcceptQuote')}
                  disabled={busy}
                  onPress={() => void accept(quote.id)}
                />
              </View>
            ) : null}
          </Card>
        ))
      )}

      {notice ? (
        <Body size="caption" muted style={{ marginTop: space.sm }}>
          {notice}
        </Body>
      ) : null}

      {!decided ? (
        <Button title={t('cancelRequest')} variant="danger" disabled={busy} onPress={() => void cancel()} />
      ) : null}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
