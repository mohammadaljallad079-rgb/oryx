import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { OfferCard } from '../../components/cards';
import { Body, Button, Card, Field, Screen, SectionLabel, StateView } from '../../components/ui';
import { space } from '../../lib/theme';

/**
 * Promotions.
 *
 * The offers already published and a form for a new one. Publishing is a demo
 * action; the form validates its fields and says what it did.
 */
export default function MerchantPromotions() {
  const { t, direction, dataVersion } = useApp();
  const offers = useAsync(async () => repository.offers(), [dataVersion]);

  return (
    <Screen>
      <ScreenHeader title={t('promotions')} />

      <Card>
        <SectionLabel>{t('addPromotion')}</SectionLabel>
        <View style={{ marginTop: space.md }}>
          <Field label={t('productName')} testID="promotion-title" />
          <Field label={t('off')} keyboardType="number-pad" hint="percentage, e.g. 15" testID="promotion-percent" />
          <Field label={t('categories')} testID="promotion-category" />
        </View>
        <Button title={t('save')} onPress={() => undefined} />
        <View style={{ height: space.sm }} />
        <Body size="caption" muted>
          {t('demoNotice')}
        </Body>
      </Card>

      <SectionLabel>{t('offersAndDiscounts')}</SectionLabel>
      {offers.loading ? (
        <StateView kind="loading" />
      ) : (
        <View style={[styles.grid, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          {(offers.data ?? []).map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </View>
      )}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: space.md },
});
