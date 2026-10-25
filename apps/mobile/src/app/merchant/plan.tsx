import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { Body, Button, Card, Chip, Divider, Heading, Screen, SectionLabel, StateView } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatMoney, localizeDigits } from '../../lib/format';

/**
 * Subscription plans.
 *
 * The three marketplace plans, with the commission and the ERP tools each one
 * unlocks. The current plan is marked, and the comparison is a real read of the
 * plan records rather than hard-coded copy.
 */
export default function MerchantPlan() {
  const { t, theme, locale, account, direction, dataVersion } = useApp();
  const router = useRouter();

  const plans = useAsync(async () => repository.plans(), [dataVersion]);

  return (
    <Screen>
      <ScreenHeader title={t('subscription')} subtitle={t('choosePlan')} />

      {plans.loading ? (
        <StateView kind="loading" />
      ) : (
        (plans.data ?? []).map((plan) => {
          const current = plan.id === account?.planId;
          return (
            <Card
              key={plan.id}
              style={plan.highlighted ? { borderColor: theme.gold, borderWidth: 2 } : undefined}
            >
              <View style={styles.headRow}>
                <Heading size="subheading">{locale === 'ar' ? plan.nameAr : plan.nameEn}</Heading>
                {plan.highlighted ? <Chip label={t('upgradePlan')} active /> : null}
                {current ? <Chip label={t('currentPlan')} active /> : null}
              </View>
              <Text style={{ color: theme.gold, fontSize: typography.title, fontWeight: '700', marginTop: space.sm }}>
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
                <Button
                  testID={`plan-choose-${plan.id}`}
                  title={current ? t('currentPlan') : t('choosePlan')}
                  disabled={current}
                  onPress={() => router.back()}
                />
              </View>
            </Card>
          );
        })
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
