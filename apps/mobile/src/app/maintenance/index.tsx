import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../lib/app-context';
import { useAsync } from '../../lib/use-async';
import { AppHeader } from '../../components/brand';
import { Screen, Card, Body, Button, StateView, SectionLabel } from '../../components/ui';
import { space } from '../../lib/theme';
import { formatMoney } from '../../lib/format';
import { maintenanceServicesApi, serviceRequestsApi } from '../../lib/api';

/** Company-scoped maintenance offers use the exact catalogue published by ERP. */
export default function MaintenanceServicesScreen() {
  const { t, locale } = useApp();
  const router = useRouter();
  const catalog = useAsync(() => maintenanceServicesApi.list(), []);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const request = async (code: string, companyId: string, name: string) => {
    if (sending) return;
    setSending(code);
    setError(null);
    try {
      await serviceRequestsApi.create({ categoryKey: code, companyId, description: name });
      setSent((current) => [...current, code]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setSending(null);
    }
  };

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Button title={t('back')} variant="secondary" onPress={() => router.back()} />
        <SectionLabel>{locale === 'ar' ? 'خدمات صيانة المركبات' : 'Vehicle maintenance services'}</SectionLabel>
        {error ? <Card><Body>{error}</Body></Card> : null}
        {catalog.loading && !catalog.data ? <StateView kind="loading" /> : null}
        {catalog.error ? <StateView kind="error" message={t('loadFailed')} /> : null}
        {!catalog.loading && catalog.data?.length === 0 ? <StateView kind="empty" message={t('noResults')} /> : null}
        {catalog.data?.map((service) => {
          const name = locale === 'ar' ? service.nameAr : service.nameEn;
          const description = locale === 'ar' ? service.descriptionAr : service.descriptionEn;
          return <Card key={service.id}>
            <SectionLabel>{name}</SectionLabel>
            {description ? <Body muted>{description}</Body> : null}
            <Body>{formatMoney(service.priceMinor)}</Body>
            <Body muted size="caption">{service.durationMinutes} min</Body>
            <Button
              testID={`maintenance-request-${service.key}`}
              title={sent.includes(service.key)
                ? (locale === 'ar' ? 'تم إرسال الطلب' : 'Request sent')
                : sending === service.key
                  ? t('loading')
                  : (locale === 'ar' ? 'طلب خدمة' : 'Request service')}
              disabled={Boolean(sending) || sent.includes(service.key)}
              onPress={() => void request(service.key, service.companyId, name)}
            />
          </Card>;
        })}
      </View>
    </Screen>
  );
}
