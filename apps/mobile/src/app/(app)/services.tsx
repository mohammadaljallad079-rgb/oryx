import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { api, ApiError, SERVICE_CATEGORIES } from '../../lib/api';
import { useAsync } from '../../lib/use-async';
import {
  Badge,
  Body,
  Button,
  Card,
  DetailRow,
  Field,
  Heading,
  Screen,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';

/**
 * Service discovery and marketplace requests.
 *
 * The provider directory is public; submitting a request requires a session and
 * the API scopes the new request to the caller's account.
 */
export default function ServicesScreen() {
  const { t, locale, theme } = useApp();
  const router = useRouter();

  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const providers = useAsync(() => api.providers(categoryKey ?? undefined), [categoryKey]);
  const requests = useAsync(() => api.serviceRequests(), []);

  return (
    <Screen>
      <Heading>{t('services')}</Heading>
      <View style={styles.chips}>
        <Button
          title={t('none')}
          variant={categoryKey === null ? 'primary' : 'secondary'}
          onPress={() => setCategoryKey(null)}
        />
        {SERVICE_CATEGORIES.map((category) => (
          <Button
            key={category.key}
            title={locale === 'ar' ? category.nameAr : category.nameEn}
            variant={categoryKey === category.key ? 'primary' : 'secondary'}
            onPress={() => setCategoryKey(category.key)}
          />
        ))}
      </View>

      <View style={{ height: space.lg }} />
      <Heading>{t('provider')}</Heading>
      {providers.loading ? (
        <StateView kind="loading" />
      ) : providers.error ? (
        <StateView kind="error" message={providers.error} onRetry={providers.reload} />
      ) : (providers.data?.items ?? []).length === 0 ? (
        <Card>
          <Body muted>{t('noProviders')}</Body>
        </Card>
      ) : (
        (providers.data?.items ?? []).map((provider) => (
          <Card key={provider.id} onPress={() => router.push(`/(app)/providers/${provider.id}`)}>
            <View style={styles.row}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.heading }}>
                {locale === 'ar' ? provider.nameAr : provider.nameEn}
              </Text>
              {provider.averageRating ? (
                <Badge text={`★ ${provider.averageRating.toFixed(1)}`} status="APPROVED" />
              ) : null}
            </View>
            {provider.city ? (
              <View style={{ marginTop: space.sm }}>
                <DetailRow label={t('category')} value={provider.city} />
              </View>
            ) : null}
          </Card>
        ))
      )}

      <Heading>{t('requestService')}</Heading>
      <NewRequestCard onCreated={requests.reload} />

      <Heading>{t('myRequests')}</Heading>
      {requests.loading ? (
        <StateView kind="loading" />
      ) : requests.error ? (
        <StateView kind="error" message={requests.error} onRetry={requests.reload} />
      ) : (requests.data?.items ?? []).length === 0 ? (
        <Card>
          <Body muted>{t('none')}</Body>
        </Card>
      ) : (
        (requests.data?.items ?? []).map((request) => (
          <Card key={request.id}>
            <View style={styles.row}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{request.requestNumber}</Text>
              <Badge text={request.status} status={request.status} />
            </View>
            <View style={{ height: space.sm }} />
            <DetailRow label={t('category')} value={request.categoryKey} />
            {request.description ? (
              <DetailRow label={t('describeIssue')} value={request.description} />
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

function NewRequestCard({ onCreated }: { onCreated: () => void }) {
  const { t, locale, theme } = useApp();
  const vehicles = useAsync(() => api.vehicles(), []);
  const [categoryKey, setCategoryKey] = useState<string>(SERVICE_CATEGORIES[0].key);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.createServiceRequest({
        categoryKey,
        description: description.trim() || undefined,
        vehicleId: vehicleId ?? undefined,
      });
      setDescription('');
      setDone(true);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {done ? <Badge text={t('requestSubmitted')} status="APPROVED" /> : null}
      <View style={{ height: space.sm }} />
      <View style={styles.chips}>
        {SERVICE_CATEGORIES.map((category) => (
          <Button
            key={category.key}
            title={locale === 'ar' ? category.nameAr : category.nameEn}
            variant={categoryKey === category.key ? 'primary' : 'secondary'}
            onPress={() => setCategoryKey(category.key)}
          />
        ))}
      </View>

      {(vehicles.data ?? []).length > 0 ? (
        <>
          <View style={{ height: space.md }} />
          <View style={styles.chips}>
            {(vehicles.data ?? []).map((vehicle) => (
              <Button
                key={vehicle.id}
                title={`${vehicle.make} ${vehicle.model}`}
                variant={vehicleId === vehicle.id ? 'primary' : 'secondary'}
                onPress={() => setVehicleId(vehicle.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={{ height: space.md }} />
      <Field
        label={t('describeIssue')}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />
      {error ? <Text style={{ color: theme.danger, marginBottom: space.sm }}>{error}</Text> : null}
      <Button title={t('submitRequest')} onPress={submit} loading={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
