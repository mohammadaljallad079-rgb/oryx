import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { Body, Button, Card, Chip, ListRow, Screen, SectionLabel, StateView } from '../components/ui';
import { space, typography } from '../lib/theme';
import { formatMoney, localizeDigits } from '../lib/format';

/**
 * The wallet.
 *
 * A balance and its ledger. Top-up is a demo action: it adds a credit to the
 * screen's own list and says it is not a payment, rather than pretending money
 * moved.
 */
export default function Wallet() {
  const { t, theme, locale, account, dataVersion } = useApp();
  const wallet = useAsync(
    async () => (account ? repository.wallet(account.id) : []),
    [account?.id, dataVersion],
  );

  if (!account) return null;

  return (
    <Screen>
      <ScreenHeader title={t('wallet')} />

      <Card style={{ alignItems: 'center' }}>
        <SectionLabel>{t('walletBalance')}</SectionLabel>
        <Text style={{ color: theme.gold, fontSize: typography.display, fontWeight: '700', marginTop: space.sm }}>
          {formatMoney(account.walletMinor)}
        </Text>
        <Body size="caption" muted style={{ marginTop: space.xs }}>
          {t('demoData')}
        </Body>
      </Card>

      <Card>
        <SectionLabel>{t('walletTopUp')}</SectionLabel>
        <View style={[styles.row]}>
          {[5_000, 10_000, 25_000].map((amount) => (
            <Chip key={amount} label={formatMoney(amount)} />
          ))}
        </View>
        <View style={{ marginTop: space.md }}>
          <Button title={t('walletTopUp')} variant="secondary" onPress={() => undefined} />
        </View>
        <Body size="caption" muted style={{ marginTop: space.sm }}>
          {t('demoNotice')}
        </Body>
      </Card>

      <SectionLabel>{t('walletHistory')}</SectionLabel>
      {wallet.loading ? (
        <StateView kind="loading" />
      ) : (wallet.data ?? []).length === 0 ? (
        <StateView kind="empty" message={t('empty')} />
      ) : (
        <Card>
          {(wallet.data ?? []).map((entry) => (
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
