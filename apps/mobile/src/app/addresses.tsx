import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { Body, Button, Card, Chip, DetailRow, Divider, Screen, StateView } from '../components/ui';
import { space } from '../lib/theme';

/**
 * Addresses.
 *
 * The customer's saved delivery addresses, with the default marked. Adding one is
 * a demo action: the form is real but nothing is persisted, which the note says.
 */
export default function Addresses() {
  const { t, locale, account, dataVersion } = useApp();
  const addresses = useAsync(
    async () => (account ? repository.addresses(account.id) : []),
    [account?.id, dataVersion],
  );

  return (
    <Screen>
      <ScreenHeader title={t('addresses')} />

      {addresses.loading ? (
        <StateView kind="loading" />
      ) : (addresses.data ?? []).length === 0 ? (
        <StateView kind="empty" message={t('empty')} />
      ) : (
        (addresses.data ?? []).map((address) => (
          <Card key={address.id}>
            <View style={[styles.headRow]}>
              <Body size="label" style={{ fontWeight: '700' }}>
                {locale === 'ar' ? address.labelAr : address.labelEn}
              </Body>
              {address.isDefault ? <Chip label={t('defaultAddress')} active /> : null}
            </View>
            <Divider />
            <DetailRow label={t('addresses')} value={locale === 'ar' ? address.lineAr : address.lineEn} />
          </Card>
        ))
      )}

      <Button title={t('addAddress')} onPress={() => undefined} />
      <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
        {t('demoNotice')}
      </Body>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
