import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useMerchantSession } from '../../lib/merchant-session';
import { ApiError, providerApi, type ProviderListing, type ProviderRequest } from '../../lib/api';
import { SERVICE_CATEGORIES } from '@oryx/shared';
import { AppHeader } from '../../components/brand';
import { BookingCard, RecoveryCard } from '../../components/cards';
import { Body, Button, Card, Chip, Divider, Field, Notice, Screen, SectionLabel, StateView } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatMoney } from '../../lib/format';

/**
 * The merchant service desk.
 *
 * Three tabs: the service requests a customer raised, the recovery queue and the
 * provider's own published listings.
 *
 * Two modes, never mixed. A **live merchant session** talks to the provider
 * portal (`/provider/…`), where the API resolves the provider from the signed-in
 * staff account's membership — the screen never sends a provider id, so a
 * merchant cannot read or act on another provider's work even if it tried. The
 * **demo merchant** keeps the local, offline review experience.
 */
export default function MerchantServices() {
  const { t, locale, theme, account, direction, dataVersion } = useApp();
  const { isSignedIn } = useMerchantSession();
  const storeId = account?.storeId ?? 'store-01';
  const [tab, setTab] = useState<'requests' | 'recovery' | 'listings'>('requests');
  const [notice, setNotice] = useState<string | null>(null);

  // ---- live provider state --------------------------------------------------
  const [requests, setRequests] = useState<ProviderRequest[]>([]);
  const [listings, setListings] = useState<ProviderListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finalAmount, setFinalAmount] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({ nameEn: '', nameAr: '', priceMinor: '', categoryKey: SERVICE_CATEGORIES[0].key });

  const loadLive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqs, ls] = await Promise.all([providerApi.requests({ pageSize: 50 }), providerApi.listings()]);
      setRequests(reqs.items);
      setListings(ls);
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('serverError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isSignedIn) {
      setRequests([]);
      setListings([]);
      return;
    }
    void loadLive();
  }, [isSignedIn, loadLive]);

  // The recovery queue is the subset of the provider's own requests whose
  // category is recovery; the portal returns every request this provider owns.
  const recoveryRequests = requests.filter((r) => r.categoryKey === 'recovery');

  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await run();
      await loadLive();
      setNotice(t('saved'));
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'forbidden' ? t('forbiddenBody') : t('serverError'));
    } finally {
      setBusyId(null);
    }
  };

  // ---- demo state (unchanged offline experience) ----------------------------
  const demoBookings = useAsync(async () => repository.merchantBookings(storeId), [storeId, dataVersion]);
  const demoRecovery = useAsync(async () => repository.merchantRecoveryRequests(storeId), [storeId, dataVersion]);
  const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'declined'>>({});
  const [demoServices, setDemoServices] = useState<Array<{ name: string; price: string; duration: string }>>([]);
  const [demoDraft, setDemoDraft] = useState({ name: '', price: '', duration: '' });

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <Chip
            testID="merchant-services-requests"
            label={isSignedIn ? t('serviceRequests') : t('myBookings')}
            active={tab === 'requests'}
            onPress={() => setTab('requests')}
          />
          <Chip testID="merchant-services-recovery" label={t('recoveryRequests')} active={tab === 'recovery'} onPress={() => setTab('recovery')} />
          <Chip testID="merchant-services-catalogue" label={t('manageServices')} active={tab === 'listings'} onPress={() => setTab('listings')} />
        </View>

        {error ? (
          <Body size="caption" align="center" style={{ color: theme.danger }}>
            {error}
          </Body>
        ) : null}

        {/* ------------------------------------------------ service requests */}
        {tab === 'requests' ? (
          isSignedIn ? (
            loading ? (
              <StateView kind="loading" />
            ) : requests.length === 0 ? (
              <StateView kind="empty" message={t('noRequests')} />
            ) : (
              requests.map((request) => (
                <Card key={request.id} testID={`provider-request-${request.id}`}>
                  <View style={[styles.headRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                      {request.requestNumber}
                    </Text>
                    <Chip label={request.status} />
                  </View>
                  {request.description ? (
                    <Body size="caption" muted style={{ marginTop: space.xs }}>
                      {request.description}
                    </Body>
                  ) : null}
                  <Divider />
                  <View style={[styles.actionRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                    {request.status === 'NEW' ? (
                      <>
                        <Button
                          testID={`provider-accept-${request.id}`}
                          title={t('acceptRequest')}
                          loading={busyId === request.id}
                          onPress={() => void act(request.id, () => providerApi.acceptRequest(request.id))}
                        />
                        <Button
                          testID={`provider-decline-${request.id}`}
                          title={t('rejectRequest')}
                          variant="danger"
                          disabled={busyId === request.id}
                          onPress={() => void act(request.id, () => providerApi.declineRequest(request.id))}
                        />
                      </>
                    ) : null}
                    {request.status === 'ASSIGNED' ? (
                      <Button
                        testID={`provider-start-${request.id}`}
                        title={t('startWork')}
                        loading={busyId === request.id}
                        onPress={() => void act(request.id, () => providerApi.startRequest(request.id))}
                      />
                    ) : null}
                    {request.status === 'IN_PROGRESS' ? (
                      <>
                        <Field
                          label={t('finalAmount')}
                          value={finalAmount[request.id] ?? ''}
                          onChangeText={(v) => setFinalAmount((prev) => ({ ...prev, [request.id]: v }))}
                          keyboardType="number-pad"
                          testID={`provider-amount-${request.id}`}
                        />
                        <Button
                          testID={`provider-complete-${request.id}`}
                          title={t('completeWork')}
                          disabled={busyId === request.id || !Number(finalAmount[request.id])}
                          onPress={() =>
                            void act(request.id, () =>
                              providerApi.completeRequest(request.id, {
                                finalAmountMinor: Number(finalAmount[request.id]),
                                currency: 'BHD',
                              }),
                            )
                          }
                        />
                      </>
                    ) : null}
                  </View>
                </Card>
              ))
            )
          ) : demoBookings.loading ? (
            <StateView kind="loading" />
          ) : (
            (demoBookings.data ?? []).map((booking) => (
              <BookingCard key={booking.id} booking={booking} provider={repository.provider(booking.providerId)} />
            ))
          )
        ) : null}

        {/* ----------------------------------------------------- recovery queue */}
        {tab === 'recovery' ? (
          isSignedIn ? (
            loading ? (
              <StateView kind="loading" />
            ) : recoveryRequests.length === 0 ? (
              <StateView kind="empty" message={t('noRequests')} />
            ) : (
              recoveryRequests.map((request) => (
                <Card key={request.id} testID={`provider-recovery-${request.id}`}>
                  <View style={[styles.headRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                      {request.requestNumber}
                    </Text>
                    <Chip label={request.status} />
                  </View>
                  {request.description ? (
                    <Body size="caption" muted style={{ marginTop: space.xs }}>
                      {request.description}
                    </Body>
                  ) : null}
                  <Divider />
                  <View style={[styles.actionRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                    {request.status === 'NEW' ? (
                      <>
                        <Button
                          testID={`provider-accept-${request.id}`}
                          title={t('acceptRequest')}
                          loading={busyId === request.id}
                          onPress={() => void act(request.id, () => providerApi.acceptRequest(request.id))}
                        />
                        <Button
                          testID={`provider-decline-${request.id}`}
                          title={t('rejectRequest')}
                          variant="danger"
                          disabled={busyId === request.id}
                          onPress={() => void act(request.id, () => providerApi.declineRequest(request.id))}
                        />
                      </>
                    ) : null}
                    {request.status === 'ASSIGNED' ? (
                      <Button
                        testID={`provider-start-${request.id}`}
                        title={t('startWork')}
                        loading={busyId === request.id}
                        onPress={() => void act(request.id, () => providerApi.startRequest(request.id))}
                      />
                    ) : null}
                    {request.status === 'IN_PROGRESS' ? (
                      <>
                        <Field
                          label={t('finalAmount')}
                          value={finalAmount[request.id] ?? ''}
                          onChangeText={(v) => setFinalAmount((prev) => ({ ...prev, [request.id]: v }))}
                          keyboardType="number-pad"
                          testID={`provider-amount-${request.id}`}
                        />
                        <Button
                          testID={`provider-complete-${request.id}`}
                          title={t('completeWork')}
                          disabled={busyId === request.id || !Number(finalAmount[request.id])}
                          onPress={() =>
                            void act(request.id, () =>
                              providerApi.completeRequest(request.id, {
                                finalAmountMinor: Number(finalAmount[request.id]),
                                currency: 'BHD',
                              }),
                            )
                          }
                        />
                      </>
                    ) : null}
                  </View>
                </Card>
              ))
            )
          ) : demoRecovery.loading ? (
            <StateView kind="loading" />
          ) : (
            (demoRecovery.data ?? []).map((job) => (
              <View key={job.id}>
                <RecoveryCard job={job} />
                {decisions[job.id] ? (
                  <Notice
                    text={`${t('saved')} · ${decisions[job.id] === 'accepted' ? t('acceptRequest') : t('rejectRequest')}`}
                  />
                ) : (
                  <View style={[styles.actionRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                    <Button
                      testID={`recovery-accept-${job.id}`}
                      title={t('acceptRequest')}
                      variant="secondary"
                      onPress={() => {
                        setDecisions((prev) => ({ ...prev, [job.id]: 'accepted' }));
                        setNotice(`${t('saved')} · ${t('acceptRequest')}`);
                      }}
                    />
                    <Button
                      testID={`recovery-decline-${job.id}`}
                      title={t('rejectRequest')}
                      variant="danger"
                      onPress={() => {
                        setDecisions((prev) => ({ ...prev, [job.id]: 'declined' }));
                        setNotice(`${t('saved')} · ${t('rejectRequest')}`);
                      }}
                    />
                  </View>
                )}
              </View>
            ))
          )
        ) : null}

        {/* ---------------------------------------------------------- listings */}
        {tab === 'listings' ? (
          isSignedIn ? (
            <Card>
              <SectionLabel>{t('myListings')}</SectionLabel>
              {loading ? (
                <StateView kind="loading" />
              ) : listings.length === 0 ? (
                <Body muted size="label" style={{ marginTop: space.sm }}>
                  {t('noListings')}
                </Body>
              ) : (
                listings.map((listing) => (
                  <View key={listing.id} style={{ marginTop: space.md }}>
                    <View style={[styles.headRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                        {listing.nameEn}
                      </Text>
                      <Chip label={listing.isActive ? t('listingActive') : t('listingInactive')} active={listing.isActive} />
                    </View>
                    <Body size="caption" muted>
                      {listing.nameAr} · {formatMoney(listing.priceMinor)}
                    </Body>
                    <View style={[styles.actionRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                      <Button
                        testID={`provider-listing-toggle-${listing.id}`}
                        title={listing.isActive ? t('listingInactive') : t('listingActive')}
                        variant="secondary"
                        loading={busyId === listing.id}
                        onPress={() =>
                          void act(listing.id, () => providerApi.updateListing(listing.id, { isActive: !listing.isActive }))
                        }
                      />
                    </View>
                  </View>
                ))
              )}
              <Divider />
              <SectionLabel>{t('addService')}</SectionLabel>
              <View style={{ marginTop: space.md }}>
                <Field
                  label={t('listingNameEn')}
                  value={draft.nameEn}
                  onChangeText={(nameEn) => setDraft((d) => ({ ...d, nameEn }))}
                  testID="provider-listing-name-en"
                />
                <Field
                  label={t('listingNameAr')}
                  value={draft.nameAr}
                  onChangeText={(nameAr) => setDraft((d) => ({ ...d, nameAr }))}
                  testID="provider-listing-name-ar"
                />
                <Field
                  label={t('listingPrice')}
                  value={draft.priceMinor}
                  onChangeText={(priceMinor) => setDraft((d) => ({ ...d, priceMinor }))}
                  keyboardType="number-pad"
                  testID="provider-listing-price"
                />
                {/* The category must be a real catalogue key; a free-text value
                    would store a listing no customer rail can ever match. */}
                <Body size="caption" muted style={{ marginBottom: space.xs }}>
                  {t('serviceCategory')}
                </Body>
                <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                  {SERVICE_CATEGORIES.map((category) => (
                    <Chip
                      key={category.key}
                      testID={`provider-listing-category-${category.key}`}
                      label={locale === 'ar' ? category.nameAr : category.nameEn}
                      active={draft.categoryKey === category.key}
                      onPress={() => setDraft((d) => ({ ...d, categoryKey: category.key }))}
                    />
                  ))}
                </View>
              </View>
              <Button
                testID="provider-listing-create"
                title={t('addService')}
                disabled={!draft.nameEn || !draft.nameAr || !Number(draft.priceMinor)}
                onPress={() =>
                  void act('new', async () => {
                    await providerApi.createListing({
                      categoryKey: draft.categoryKey,
                      nameEn: draft.nameEn,
                      nameAr: draft.nameAr,
                      priceMinor: Number(draft.priceMinor),
                    });
                    setDraft({ nameEn: '', nameAr: '', priceMinor: '', categoryKey: SERVICE_CATEGORIES[0].key });
                  })
                }
              />
              <Notice text={notice} />
            </Card>
          ) : (
            <Card>
              <SectionLabel>{t('addService')}</SectionLabel>
              <View style={{ marginTop: space.md }}>
                <Field
                  label={t('serviceName')}
                  value={demoDraft.name}
                  onChangeText={(name) => setDemoDraft((d) => ({ ...d, name }))}
                  testID="merchant-service-name"
                />
                <Field
                  label={t('servicePrice')}
                  value={demoDraft.price}
                  onChangeText={(price) => setDemoDraft((d) => ({ ...d, price }))}
                  keyboardType="number-pad"
                  hint="minor units, e.g. 25000"
                  testID="merchant-service-price"
                />
                <Field
                  label={t('serviceDuration')}
                  value={demoDraft.duration}
                  onChangeText={(duration) => setDemoDraft((d) => ({ ...d, duration }))}
                  keyboardType="number-pad"
                  testID="merchant-service-duration"
                />
              </View>
              <Button
                testID="merchant-add-service"
                title={t('addService')}
                disabled={!demoDraft.name}
                onPress={() => {
                  setDemoServices((prev) => [...prev, demoDraft]);
                  setDemoDraft({ name: '', price: '', duration: '' });
                  setNotice(t('saved'));
                }}
              />
              <Notice text={notice} />
              <View style={{ height: space.sm }} />
              <Body size="caption" muted>
                {t('demoNotice')}
              </Body>
              {demoServices.map((service, index) => (
                <View key={`${service.name}-${index}`} style={{ marginTop: space.md }}>
                  <Body size="label" style={{ fontWeight: '700' }}>
                    {service.name}
                  </Body>
                  <Body size="caption" muted>
                    {service.price ? `${service.price} · ` : ''}
                    {service.duration ? `${service.duration} ${t('minutes')}` : ''}
                  </Body>
                </View>
              ))}
            </Card>
          )
        ) : null}
        <View style={{ height: space.xl }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm },
  headRow: { alignItems: 'center', gap: space.sm, justifyContent: 'space-between' },
  actionRow: { gap: space.sm, marginTop: space.sm, alignItems: 'center' },
});
