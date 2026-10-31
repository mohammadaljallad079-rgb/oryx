import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useMerchantSession } from '../../lib/merchant-session';
import { ScreenHeader } from '../../components/brand';
import { OfferCard } from '../../components/cards';
import { Body, Button, Card, Field, Notice, Screen, SectionLabel, StateView } from '../../components/ui';
import { space } from '../../lib/theme';
import { ApiError, providerApi, type ProviderOffer } from '../../lib/api';

/**
 * Merchant promotions.
 *
 * A live merchant publishes, withdraws and relists real offers through the
 * provider portal (`/provider/offers`). The API resolves the provider from the
 * signed-in account's membership, so the list is always this merchant's own and
 * the form cannot post against another tenant.
 *
 * A **demo** merchant (signed out) sees the bundled demo offers under a "Demo
 * data" label; nothing from the demo store is ever shown inside a live session.
 */
export default function MerchantPromotions() {
  const { t, l, direction, dataVersion } = useApp();
  const { isSignedIn } = useMerchantSession();

  const demo = useAsync(async () => (isSignedIn ? [] : repository.offers()), [dataVersion, isSignedIn]);

  const [offers, setOffers] = useState<ProviderOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ titleEn: '', titleAr: '', percent: '', categoryKey: '' });

  const load = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    setError(null);
    try {
      setOffers(await providerApi.offers({ includeInactive: true }));
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    const percent = Number(draft.percent.replace(/[^\d.]/g, ''));
    if (!draft.titleEn.trim() || !draft.titleAr.trim() || !Number.isFinite(percent)) {
      setError(t('validationFailed'));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await providerApi.createOffer({
        titleEn: draft.titleEn.trim(),
        titleAr: draft.titleAr.trim(),
        categoryKey: draft.categoryKey.trim() || undefined,
        percentOffBp: Math.round(percent * 100),
      });
      setDraft({ titleEn: '', titleAr: '', percent: '', categoryKey: '' });
      setNotice(t('saved'));
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('loadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (offer: ProviderOffer) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await providerApi.updateOffer(offer.id, { isActive: !offer.isActive });
      setNotice(offer.isActive ? t('offerWithdrawn') : t('offerRelisted'));
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('loadFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (isSignedIn) {
    return (
      <Screen>
        <ScreenHeader title={t('promotions')} />

        <Card>
          <SectionLabel>{t('addPromotion')}</SectionLabel>
          <View style={{ marginTop: space.md }}>
            <Field
              label={t('titleEn')}
              testID="promotion-title-en"
              value={draft.titleEn}
              onChangeText={(titleEn) => setDraft((d) => ({ ...d, titleEn }))}
            />
            <Field
              label={t('titleAr')}
              testID="promotion-title-ar"
              value={draft.titleAr}
              onChangeText={(titleAr) => setDraft((d) => ({ ...d, titleAr }))}
            />
            <Field
              label={t('off')}
              keyboardType="number-pad"
              hint={t('percentHint')}
              testID="promotion-percent"
              value={draft.percent}
              onChangeText={(percent) => setDraft((d) => ({ ...d, percent }))}
            />
            <Field
              label={t('categories')}
              testID="promotion-category"
              value={draft.categoryKey}
              onChangeText={(categoryKey) => setDraft((d) => ({ ...d, categoryKey }))}
            />
          </View>
          <Button
            testID="promotion-save"
            title={t('save')}
            loading={busy}
            disabled={!draft.titleEn.trim() || !draft.titleAr.trim()}
            onPress={publish}
          />
          <Notice text={error ?? notice} />
        </Card>

        <SectionLabel>{t('publishedOffers')}</SectionLabel>
        {loading && offers.length === 0 ? (
          <Card>
            <StateView kind="loading" />
          </Card>
        ) : offers.length === 0 ? (
          <Card>
            <StateView kind="empty" message={t('noOffers')} />
          </Card>
        ) : (
          offers.map((offer) => (
            <Card key={offer.id}>
              <Body size="label" style={{ fontWeight: '700' }}>
                {l({ en: offer.titleEn, ar: offer.titleAr })}
              </Body>
              <Body size="caption" muted>
                {`${Math.round(offer.percentOffBp / 100)}% · ${offer.isActive ? t('active') : t('withdrawn')}`}
              </Body>
              <View style={{ marginTop: space.md }}>
                <Button
                  testID={`promotion-toggle-${offer.id}`}
                  title={offer.isActive ? t('withdraw') : t('relist')}
                  variant="secondary"
                  loading={busy}
                  onPress={() => toggle(offer)}
                />
              </View>
            </Card>
          ))
        )}
        <View style={{ height: space.xl }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('promotions')} />

      <Card>
        <SectionLabel>{t('addPromotion')}</SectionLabel>
        <View style={{ marginTop: space.md }}>
          <Field
            label={t('productName')}
            testID="promotion-title"
            value={draft.titleEn}
            onChangeText={(titleEn) => setDraft((d) => ({ ...d, titleEn }))}
          />
          <Field
            label={t('off')}
            keyboardType="number-pad"
            hint={t('percentHint')}
            testID="promotion-percent"
            value={draft.percent}
            onChangeText={(percent) => setDraft((d) => ({ ...d, percent }))}
          />
          <Field
            label={t('categories')}
            testID="promotion-category"
            value={draft.categoryKey}
            onChangeText={(categoryKey) => setDraft((d) => ({ ...d, categoryKey }))}
          />
        </View>
        <Button
          testID="promotion-save"
          title={t('save')}
          disabled={!draft.titleEn}
          onPress={() => {
            setDraft({ titleEn: '', titleAr: '', percent: '', categoryKey: '' });
            setNotice(t('demoNotice'));
          }}
        />
        <Notice text={notice} />
      </Card>

      <SectionLabel>{t('offersAndDiscounts')}</SectionLabel>
      {demo.loading ? (
        <Card>
          <StateView kind="loading" />
        </Card>
      ) : (
        <View
          style={{
            flexWrap: 'wrap',
            gap: space.md,
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
          }}
        >
          {(demo.data ?? []).map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </View>
      )}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}
