import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader, Monogram } from '../../components/brand';
import {
  Body,
  Button,
  Card,
  Chip,
  DetailRow,
  Divider,
  Field,
  Heading,
  Notice,
  Photo,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatMoney, localizeDigits } from '../../lib/format';

/**
 * The store profile.
 *
 * The store's public details, its subscription and the ERP tools that plan
 * unlocks. The plan card is honest about what is licensed: a tool the plan does
 * not include is shown locked, not hidden.
 */
export default function MerchantProfile() {
  const { t, theme, locale, account, direction, switchRole, signOut, dataVersion } = useApp();
  const router = useRouter();
  const storeId = account?.storeId ?? 'store-01';

  const store = useAsync(async () => repository.merchantStore(storeId), [storeId, dataVersion]);
  const customers = useAsync(async () => repository.merchantCustomers(storeId), [storeId, dataVersion]);
  const [editing, setEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  if (!account) return null;

  const tools = ['salesTool', 'inventoryTool', 'purchasingTool', 'accountingTool', 'hrTool', 'reportsTool'];
  const licensed = ['salesTool', 'inventoryTool', 'reportsTool'];

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Card>
          <View style={[styles.headRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            <Monogram initials={account.avatarInitials} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.heading }}>
                {locale === 'ar' ? account.fullNameAr : account.fullNameEn}
              </Text>
              <Body size="caption" muted>
                {account.email}
              </Body>
              <Body size="caption" muted>
                {account.phone}
              </Body>
            </View>
          </View>
        </Card>

        {store.loading ? (
          <StateView kind="loading" />
        ) : store.data ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Photo source={photo(store.data.photo)} height={140} width="100%" radiusValue={0} />
            <View style={{ padding: space.lg }}>
              <Heading size="subheading">{locale === 'ar' ? store.data.nameAr : store.data.nameEn}</Heading>
              <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                {store.data.verified ? <Chip label={t('verified')} active /> : null}
                <Chip label={`${t('from')} ${localizeDigits(store.data.since, locale)}`} />
              </View>
              <Divider />
              <DetailRow label={t('delivery')} value={store.data.deliveryMinor === 0 ? t('freeDelivery') : formatMoney(store.data.deliveryMinor)} />
              <DetailRow label={t('rating')} value={store.data.rating.toFixed(1)} />
              <DetailRow label={t('reviews')} value={localizeDigits(store.data.reviewCount, locale)} />
            </View>
          </Card>
        ) : null}

        <Card>
          <SectionLabel>{t('storeProfile')}</SectionLabel>
          {editing ? (
            <>
              <View style={{ marginTop: space.sm }}>
                <Field
                  label={t('storeDescription')}
                  testID="store-description"
                  value={draftDescription}
                  onChangeText={setDraftDescription}
                  multiline
                />
              </View>
              <Button
                testID="store-save"
                title={t('save')}
                onPress={() => {
                  setEditing(false);
                  setNotice(t('saved'));
                }}
              />
              <View style={{ height: space.sm }} />
              <Button title={t('cancel')} variant="secondary" onPress={() => setEditing(false)} />
            </>
          ) : (
            <>
              <Body size="caption" muted style={{ marginTop: space.sm }}>
                {draftDescription || t('storeDescription')}
              </Body>
              <View style={{ marginTop: space.md }}>
                <Button testID="store-edit" title={t('edit')} variant="secondary" onPress={() => setEditing(true)} />
              </View>
            </>
          )}
          <Notice text={notice} />
        </Card>

        <Card>
          <SectionLabel>{t('subscription')}</SectionLabel>
          <Divider />
          <DetailRow label={t('currentPlan')} value={account.planId ?? t('none')} />
          <DetailRow label={t('commission')} value="1.5%" />
          <View style={{ marginTop: space.md }}>
            <Button title={t('upgradePlan')} onPress={() => router.push('/merchant/plan')} />
          </View>
        </Card>

        <Card>
          <SectionLabel>{t('erpTools')}</SectionLabel>
          <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            {tools.map((tool) => (
              <Chip key={tool} label={`${licensed.includes(tool) ? '✓' : '🔒'} ${t(tool as never)}`} active={licensed.includes(tool)} />
            ))}
          </View>
          <Body size="caption" muted style={{ marginTop: space.md }}>
            {t('erpLocked')}
          </Body>
        </Card>

        <Card>
          <SectionLabel>{t('customers')}</SectionLabel>
          {customers.loading ? (
            <StateView kind="loading" />
          ) : (
            (customers.data ?? []).map((row) => (
              <DetailRow
                key={row.account.id}
                label={locale === 'ar' ? row.account.fullNameAr : row.account.fullNameEn}
                value={`${localizeDigits(row.orderCount, locale)} · ${formatMoney(row.spendMinor)}`}
              />
            ))
          )}
        </Card>

        <Button title={t('switchToCustomer')} variant="secondary" onPress={() => { switchRole(); router.replace('/(tabs)/home'); }} />
        <View style={{ height: space.sm }} />
        <Button title={t('signOut')} variant="danger" onPress={() => { void signOut(); router.replace('/login'); }} />
        <Body size="caption" muted align="center">
          ORYX Marketplace · {t('version')} 1.0.0 · {t('demoData')}
        </Body>
        <View style={{ height: space.xl }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { alignItems: 'center', gap: space.md },
  row: { flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
