import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useMerchantSession } from '../../lib/merchant-session';
import { ScreenHeader } from '../../components/brand';
import { Body, Button, Card, Chip, Divider, Heading, Screen, SectionLabel, StateView } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatMoney, localizeDigits } from '../../lib/format';
import {
  ApiError,
  subscriptionApi,
  type CompanySubscription,
  type SubscriptionPlan,
} from '../../lib/api';

/**
 * Subscription plans.
 *
 * Two sources, never mixed.
 *
 *   - **Live** — the real plan catalogue (`GET /plans`) and the tenant's own
 *     subscription (`GET /subscriptions`, scoped by the API to the token's
 *     company). The current plan is marked from the server's `planId`, not from
 *     a local guess, and a change is a company-administrator action, so the
 *     button says where it lives rather than pretending to switch the plan.
 *   - **Demo** — the local catalogue under a "Demo data" label.
 */
export default function MerchantPlan() {
  const { t, theme, locale, direction, dataVersion } = useApp();
  const { isSignedIn } = useMerchantSession();
  const router = useRouter();

  const demo = useAsync(async () => (isSignedIn ? [] : repository.plans()), [dataVersion, isSignedIn]);

  const livePlans = useAsync<SubscriptionPlan[]>(
    async () => (isSignedIn ? subscriptionApi.plans() : []),
    [isSignedIn],
  );
  const liveSub = useAsync<CompanySubscription[]>(
    async () => (isSignedIn ? subscriptionApi.current() : []),
    [isSignedIn],
  );
  const currentPlanId = liveSub.data?.[0]?.planId ?? null;

  if (isSignedIn) {
    const plans = livePlans.data ?? [];
    return (
      <Screen>
        <ScreenHeader title={t('subscription')} subtitle={t('choosePlan')} />

        {liveSub.data?.[0] ? (
          <Card style={{ borderColor: theme.gold, borderWidth: 1 }}>
            <SectionLabel>{t('currentPlan')}</SectionLabel>
            <Heading size="subheading">
              {locale === 'ar' ? liveSub.data[0].planNameAr : liveSub.data[0].planNameEn}
            </Heading>
            <Body size="caption" muted style={{ marginTop: space.xs }}>
              {`${liveSub.data[0].status} · ${formatMoney(liveSub.data[0].price, liveSub.data[0].currency)}`}
            </Body>
          </Card>
        ) : null}

        {livePlans.loading && plans.length === 0 ? (
          <StateView kind="loading" />
        ) : livePlans.error ? (
          <Card>
            <StateView
              kind="error"
              message={livePlans.error instanceof ApiError && livePlans.error.kind === 'offline'
                ? t('offlineBody')
                : t('loadFailed')}
            />
          </Card>
        ) : plans.length === 0 ? (
          <Card>
            <StateView kind="empty" message={t('planManagedByAdmin')} />
          </Card>
        ) : (
          plans.map((plan) => {
            const current = plan.id === currentPlanId;
            return (
              <Card key={plan.id} style={current ? { borderColor: theme.gold, borderWidth: 2 } : undefined}>
                <View style={styles.headRow}>
                  <Heading size="subheading">{locale === 'ar' ? plan.nameAr : plan.nameEn}</Heading>
                  {current ? <Chip label={t('currentPlan')} active /> : null}
                </View>
                <Text
                  style={{ color: theme.gold, fontSize: typography.title, fontWeight: '700', marginTop: space.sm }}
                >
                  {formatMoney(Math.round(plan.monthlyPrice * 100), plan.currency)}
                </Text>
                <Divider />
                <Body size="label">{locale === 'ar' ? plan.descriptionAr : plan.descriptionEn}</Body>
                <SectionLabel>{t('erpTools')}</SectionLabel>
                <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                  {plan.modules.map((tool) => (
                    <Chip key={tool.moduleKey} label={locale === 'ar' ? tool.nameAr : tool.nameEn} />
                  ))}
                </View>
              </Card>
            );
          })
        )}

        <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
          {t('planManagedByAdmin')}
        </Body>
        <View style={{ height: space.xl }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('subscription')} subtitle={t('choosePlan')} />

      {demo.loading ? (
        <StateView kind="loading" />
      ) : (
        (demo.data ?? []).map((plan) => (
          <Card
            key={plan.id}
            style={plan.highlighted ? { borderColor: theme.gold, borderWidth: 2 } : undefined}
          >
            <View style={styles.headRow}>
              <Heading size="subheading">{locale === 'ar' ? plan.nameAr : plan.nameEn}</Heading>
              {plan.highlighted ? <Chip label={t('upgradePlan')} active /> : null}
            </View>
            <Text
              style={{ color: theme.gold, fontSize: typography.title, fontWeight: '700', marginTop: space.sm }}
            >
              {formatMoney(plan.priceMinor)}
            </Text>
            <Body size="caption" muted>
              {locale === 'ar' ? plan.periodAr : plan.periodEn}
            </Body>
            <Divider />
            <Body size="label">
              {t('commission')}: {(plan.commissionBps / 100).toFixed(2)}%
            </Body>
            <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              {(locale === 'ar' ? plan.featuresAr : plan.featuresEn).map((feature) => (
                <Chip key={feature} label={`✓ ${feature}`} />
              ))}
            </View>
            <SectionLabel>{t('erpTools')}</SectionLabel>
            <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              {plan.erpModules.map((tool) => (
                <Chip key={tool} label={tool} />
              ))}
            </View>
            <View style={{ marginTop: space.md }}>
              <Button testID={`plan-choose-${plan.id}`} title={t('choosePlan')} onPress={() => router.back()} />
            </View>
          </Card>
        ))
      )}
      <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
        {t('demoNotice')} · {localizeDigits(3, locale)} {t('choosePlan')}
      </Body>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  row: { flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, marginBottom: space.sm },
});
