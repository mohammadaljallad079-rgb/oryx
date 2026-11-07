import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

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
  Field,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatDateTime, formatMoney, localizeDigits } from '../../lib/format';
import { SERVICE_CATEGORIES } from '@oryx/shared';
import type { RfqDto } from '@oryx/shared';

/**
 * Requests for quotation (P4).
 *
 * A spare part that is not in the catalogue is asked for rather than bought: the
 * customer raises an RFQ, approved providers quote, and the customer accepts one
 * quote. The list and the create form both ride the consumer plane, so the
 * server scopes every row to the signed-in account.
 *
 * The screen never shows a quote as accepted on its own — `acceptedQuoteId` is
 * the server's field, and the button to accept is offered only while the RFQ is
 * still open.
 */
export default function Rfqs() {
  const { t, locale, direction } = useApp();
  const { isLive } = useLiveSession();
  const router = useRouter();

  const [categoryKey, setCategoryKey] = useState<string>(SERVICE_CATEGORIES[0]?.key ?? 'spare_parts');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useAsync(async () => (isLive ? rfqsApi.list() : []), [isLive]);

  const raise = useCallback(async () => {
    if (busy) return;
    if (!description.trim()) {
      setNotice(t('rfqDescriptionRequired'));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await rfqsApi.create({
        categoryKey,
        description: description.trim(),
        quantity: Math.max(1, Number(quantity) || 1),
      });
      setDescription('');
      setQuantity('1');
      setNotice(t('rfqSubmitted'));
      await list.reload();
    } catch (err) {
      setNotice(
        err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('requestFailed'),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, categoryKey, description, list, quantity, t]);

  if (!isLive) {
    return (
      <Screen>
        <ScreenHeader title={t('rfqsTitle')} />
        <Card>
          <Body muted size="label">{t('guestBrowsing')}</Body>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('rfqsTitle')} subtitle={t('rfqsSubtitle')} />

      <Card>
        <SectionLabel>{t('rfqNew')}</SectionLabel>
        <View style={{ marginTop: space.md }}>
          <Body size="label" muted style={{ fontWeight: '600', marginBottom: space.xs }}>
            {t('category')}
          </Body>
          <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            {SERVICE_CATEGORIES.map((item) => (
              <View key={item.key} style={styles.chip}>
                <Button
                  testID={`rfq-category-${item.key}`}
                  title={locale === 'ar' ? item.nameAr : item.nameEn}
                  variant={categoryKey === item.key ? 'primary' : 'secondary'}
                  onPress={() => setCategoryKey(item.key)}
                />
              </View>
            ))}
          </View>
          <Field
            label={t('rfqDescription')}
            value={description}
            onChangeText={setDescription}
            multiline
            testID="rfq-description"
          />
          <Field
            label={t('quantity')}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
            testID="rfq-quantity"
          />
        </View>
        <Button
          testID="rfq-submit"
          title={t('rfqSubmit')}
          loading={busy}
          disabled={busy || !description.trim()}
          onPress={() => void raise()}
        />
        {notice ? (
          <Body size="caption" muted style={{ marginTop: space.sm }}>
            {notice}
          </Body>
        ) : null}
      </Card>

      <SectionLabel>{t('rfqMine')}</SectionLabel>
      {list.loading ? (
        <StateView kind="loading" />
      ) : (list.data ?? []).length === 0 ? (
        <StateView kind="empty" message={t('rfqNone')} />
      ) : (
        (list.data ?? []).map((rfq) => <RfqCard key={rfq.id} rfq={rfq} onOpen={() => router.push(`/rfqs/${rfq.id}`)} />)
      )}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

function RfqCard({ rfq, onOpen }: { rfq: RfqDto; onOpen: () => void }) {
  const { t, theme, locale } = useApp();
  const best = rfq.quotes[0];
  return (
    <Card onPress={onOpen} testID={`rfq-card-${rfq.reference}`}>
      <View style={styles.head}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>{rfq.reference}</Text>
        <Badge text={statusLabel(locale, rfq.status)} status={rfq.status} />
      </View>
      <Text style={{ color: theme.textMuted, fontSize: typography.label, marginTop: space.xs }} numberOfLines={2}>
        {rfq.description}
      </Text>
      <Body size="caption" muted style={{ marginTop: space.xs }}>
        {`${localizeDigits(rfq.quotes.length, locale)} ${t('rfqQuotes')}`}
        {best ? ` · ${t('rfqBest')} ${formatMoney(best.priceMinor)}` : ''}
      </Body>
      <Body size="caption" muted>{formatDateTime(rfq.createdAt)}</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: { minWidth: 120 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
