import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { Body, Button, Card, Chip, ListRow, Notice, Screen, SectionLabel, StateView } from '../components/ui';
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
  const [selected, setSelected] = useState<number>(10_000);
  const [added, setAdded] = useState<Array<{ id: string; titleAr: string; titleEn: string; createdAt: string; amountMinor: number }>>([]);
  const [notice, setNotice] = useState<string | null>(null);

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
