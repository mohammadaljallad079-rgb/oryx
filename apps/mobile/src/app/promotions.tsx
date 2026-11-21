import React from 'react';
import { View } from 'react-native';

import { useApp } from '../lib/app-context';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { OfferCard } from '../components/cards';
import { Card, Screen, StateView } from '../components/ui';
import { space } from '../lib/theme';
import { catalogApi, type CatalogOffer } from '../lib/api';
import { catalogOfferToDemo } from '../lib/api-adapters';

/**
 * The promotions the marketplace is running.
 *
 * Reads `GET /customer/catalog/offers`, which the server already filters to
 * active offers from approved providers inside their window — so what appears
 * here is exactly what a customer may act on, never an expired or withdrawn
 * discount. A guest sees the same list, because an offer is advertising.
 *
 * An empty result is shown as empty rather than padded with a demo offer the
 * platform never held.
 */
export default function Promotions() {
  const { t, direction } = useApp();
  const live = useAsync<CatalogOffer[]>(() => catalogApi.offers({ limit: 50 }), []);
  const offers = (live.data ?? []).map(catalogOfferToDemo);

  return (
    <Screen>
      <ScreenHeader title={t('offersAndDiscounts')} />

      {live.loading && offers.length === 0 ? (
        <Card>
          <StateView kind="loading" />
        </Card>
      ) : offers.length === 0 ? (
        <Card>
          <StateView kind="empty" message={t('noOffers')} />
        </Card>
      ) : (
        <View
          style={{
            flexWrap: 'wrap',
            gap: space.md,
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
          }}
        >
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </View>
      )}

      <View style={{ height: space.xl }} />
    </Screen>
  );
}
