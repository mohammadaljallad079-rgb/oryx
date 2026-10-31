import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { useLiveSession } from '../lib/live-session';
import { paymentsApi, type CustomerPayment } from '../lib/api';
import { ScreenHeader } from '../components/brand';
import { Body, Button, Card, Chip, ListRow, Notice, Screen, SectionLabel, StateView } from '../components/ui';
import { space, typography } from '../lib/theme';
import { formatMoney, localizeDigits } from '../lib/format';

/**
 * The wallet.
 *
 * Two sources, never mixed. Inside a live session the screen is the customer's
 * real **payment history** (`GET /customer/payments`): the payments raised by
 * real obligations such as invoices and bookings, with any refunds. There is no
 * top-up in live mode, because the API has no route that creates money from a
 * screen — a balance that could be incremented locally would be a fiction. The
 * offline demo keeps its local ledger and says so.
 */
export default function Wallet() {
  const { t, theme, locale, account, dataVersion } = useApp();
  const { isLive } = useLiveSession();
  const wallet = useAsync(
    async () => (account && !isLive ? repository.wallet(account.id) : []),
    [account?.id, dataVersion, isLive],
  );
  const live = useAsync(
    async () => (isLive ? paymentsApi.history({ pageSize: 50 }) : null),
    [isLive, dataVersion],
  );
  const [selected, setSelected] = useState<number>(10_000);
  const [added, setAdded] = useState<Array<{ id: string; titleAr: string; titleEn: string; createdAt: string; amountMinor: number }>>([]);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLive) {
    const payments = live.data?.items ?? [];
    const totalPaidMinor = payments
      .filter((p) => p.status === 'SUCCEEDED' || p.status === 'PAID' || p.status === 'CONFIRMED')
      .reduce((sum, p) => sum + p.amountMinor, 0);
    return (
      <Screen>
        <ScreenHeader title={t('wallet')} subtitle={t('liveMode')} />

        <Card style={{ alignItems: 'center' }}>
          <SectionLabel>{t('paymentsTotal')}</SectionLabel>
          <Text style={{ color: theme.gold, fontSize: typography.display, fontWeight: '700', marginTop: space.sm }}>
            {formatMoney(totalPaidMinor)}
          </Text>
          <Body size="caption" muted style={{ marginTop: space.xs }}>
            {t('liveModeHint')}
          </Body>
        </Card>

        <SectionLabel>{t('walletHistory')}</SectionLabel>
        {live.loading ? (
          <StateView kind="loading" />
        ) : live.error ? (
          <Card>
            <StateView kind="error" message={t('loadFailed')} />
            <Button title={t('retry')} onPress={() => void live.reload()} />
          </Card>
        ) : payments.length === 0 ? (
          <StateView kind="empty" message={t('noPayments')} />
        ) : (
          <Card>
            {payments.map((payment: CustomerPayment) => (
              <ListRow
                key={payment.id}
                title={payment.description ?? payment.intentNumber}
                subtitle={`${payment.provider} · ${payment.status}${payment.refunds.length > 0 ? ` · ${t('refunds')}: ${localizeDigits(payment.refunds.length, locale)}` : ''}`}
                trailing={
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.label }}>
                    {formatMoney(payment.amountMinor)}
                  </Text>
                }
              />
            ))}
          </Card>
        )}
        <View style={{ height: space.xl }} />
      </Screen>
    );
  }

  if (!account) return null;

  const entries = [...added, ...(wallet.data ?? [])];

  return (
    <Screen>
      <ScreenHeader title={t('wallet')} />

      <Card style={{ alignItems: 'center' }}>
        <SectionLabel>{t('walletBalance')}</SectionLabel>
        <Text style={{ color: theme.gold, fontSize: typography.display, fontWeight: '700', marginTop: space.sm }}>
          {formatMoney(account.walletMinor + added.reduce((sum, e) => sum + e.amountMinor, 0))}
        </Text>
        <Body size="caption" muted style={{ marginTop: space.xs }}>
          {t('demoData')}
        </Body>
      </Card>

      <Card>
        <SectionLabel>{t('walletTopUp')}</SectionLabel>
        <View style={[styles.row]}>
          {[5_000, 10_000, 25_000].map((amount) => (
            <Chip
              key={amount}
              testID={`topup-amount-${amount}`}
              label={formatMoney(amount)}
              active={selected === amount}
              onPress={() => setSelected(amount)}
            />
          ))}
        </View>
        <View style={{ marginTop: space.md }}>
          <Button
            testID="wallet-topup"
            title={t('walletTopUp')}
            variant="secondary"
            onPress={() => {
              setAdded((prev) => [
                {
                  id: `demo-topup-${prev.length + 1}`,
                  titleAr: 'شحن المحفظة (تجريبي)',
                  titleEn: 'Wallet top-up (demo)',
                  createdAt: new Date().toISOString().slice(0, 10),
                  amountMinor: selected,
                },
                ...prev,
              ]);
              setNotice(`${t('saved')} · ${formatMoney(selected)}`);
            }}
          />
        </View>
        <Notice text={notice} />
        <Body size="caption" muted style={{ marginTop: space.sm }}>
          {t('demoNotice')}
        </Body>
      </Card>

      <SectionLabel>{t('walletHistory')}</SectionLabel>
      {wallet.loading ? (
        <StateView kind="loading" />
      ) : entries.length === 0 ? (
        <StateView kind="empty" message={t('empty')} />
      ) : (
        <Card>
          {entries.map((entry) => (
            <ListRow
              key={entry.id}
              title={locale === 'ar' ? entry.titleAr : entry.titleEn}
              subtitle={localizeDigits(entry.createdAt.slice(0, 10), locale)}
              trailing={
                <Text
                  style={{
                    color: entry.amountMinor >= 0 ? theme.success : theme.textMuted,
                    fontWeight: '700',
                    fontSize: typography.label,
                  }}
                >
                  {entry.amountMinor >= 0 ? '+' : ''}
                  {formatMoney(entry.amountMinor)}
                </Text>
              }
            />
          ))}
        </Card>
      )}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
