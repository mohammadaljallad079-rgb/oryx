import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { OfferCard } from '../../components/cards';
import { Body, Button, Card, Field, Notice, Screen, SectionLabel, StateView } from '../../components/ui';
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
  const [draft, setDraft] = useState({ title: '', percent: '', category: '' });
  const [published, setPublished] = useState<Array<{ title: string; percent: string; category: string }>>([]);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <Screen>
      <ScreenHeader title={t('promotions')} />

      <Card>
        <SectionLabel>{t('addPromotion')}</SectionLabel>
        <View style={{ marginTop: space.md }}>
          <Field
            label={t('productName')}
            testID="promotion-title"
            value={draft.title}
            onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
          />
          <Field
            label={t('off')}
            keyboardType="number-pad"
            hint="percentage, e.g. 15"
            testID="promotion-percent"
            value={draft.percent}
            onChangeText={(percent) => setDraft((d) => ({ ...d, percent }))}
          />
          <Field
            label={t('categories')}
            testID="promotion-category"
            value={draft.category}
            onChangeText={(category) => setDraft((d) => ({ ...d, category }))}
          />
        </View>
        <Button
          testID="promotion-save"
          title={t('save')}
          disabled={!draft.title}
          onPress={() => {
            setPublished((prev) => [...prev, draft]);
            setDraft({ title: '', percent: '', category: '' });
            setNotice(t('saved'));
          }}
        />
        <Notice text={notice} />
        <View style={{ height: space.sm }} />
        <Body size="caption" muted>
          {t('demoNotice')}
        </Body>
      </Card>

      {published.length > 0 ? (
        <Card>
          <SectionLabel>{t('publishedOffers')}</SectionLabel>
          {published.map((offer, index) => (
            <View key={`${offer.title}-${index}`} style={{ marginTop: space.md }}>
              <Body size="label" style={{ fontWeight: '700' }}>
                {offer.title}
              </Body>
              <Body size="caption" muted>
                {offer.percent ? `${offer.percent}% · ` : ''}
                {offer.category}
              </Body>
            </View>
          ))}
        </Card>
      ) : null}

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
