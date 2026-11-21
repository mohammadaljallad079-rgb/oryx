import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { useLiveSession } from '../../lib/live-session';
import { ApiError, fleetsApi, vehiclesApi } from '../../lib/api';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import {
  Badge,
  Body,
  Button,
  Card,
  DetailRow,
  Field,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';
import type { FleetDto } from '@oryx/shared';

/**
 * Fleet accounts (P6).
 *
 * A fleet groups the customer's own vehicles under a named account and carries
 * its drivers. Creating one and adding a vehicle both ride the consumer plane:
 * the account is resolved from the bearer token, so a fleet can never be read or
 * changed across accounts. Only the caller's own garage vehicles can be added,
 * because the picker is fed by `GET /customer/vehicles`.
 */
export default function Fleets() {
  const { t, locale, direction } = useApp();
  const { isLive } = useLiveSession();

  const [name, setName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useAsync(async () => (isLive ? fleetsApi.list() : []), [isLive]);
  const garage = useAsync(async () => (isLive ? vehiclesApi.list() : []), [isLive]);

  const create = useCallback(async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      await fleetsApi.create({ name: name.trim(), contactPhone: contactPhone.trim() || undefined });
      setName('');
      setContactPhone('');
      setNotice(t('fleetCreated'));
      await list.reload();
    } catch (err) {
      setNotice(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('requestFailed'));
    } finally {
      setBusy(false);
    }
  }, [busy, contactPhone, list, name, t]);

  if (!isLive) {
    return (
      <Screen>
        <ScreenHeader title={t('fleetsTitle')} />
        <Card>
          <Body muted size="label">{t('guestBrowsing')}</Body>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('fleetsTitle')} subtitle={t('fleetsSubtitle')} />

      <Card>
        <SectionLabel>{t('fleetNew')}</SectionLabel>
        <View style={{ marginTop: space.md }}>
          <Field label={t('fleetName')} value={name} onChangeText={setName} testID="fleet-name" />
          <Field
            label={t('phone')}
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
            testID="fleet-phone"
          />
        </View>
        <Button
          testID="fleet-create"
          title={t('fleetCreate')}
          loading={busy}
          disabled={busy || !name.trim()}
          onPress={() => void create()}
        />
        {notice ? (
          <Body size="caption" muted style={{ marginTop: space.sm }}>
            {notice}
          </Body>
        ) : null}
      </Card>

      <SectionLabel>{t('fleetsMine')}</SectionLabel>
      {list.loading ? (
        <StateView kind="loading" />
      ) : (list.data ?? []).length === 0 ? (
        <StateView kind="empty" message={t('fleetNone')} />
      ) : (
        (list.data ?? []).map((fleet) => (
          <FleetCard
            key={fleet.id}
            fleet={fleet}
            garage={garage.data ?? []}
            direction={direction}
            locale={locale}
            onChanged={() => void list.reload()}
          />
        ))
      )}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

function FleetCard({
  fleet,
  garage,
  direction,
  locale,
  onChanged,
}: {
  fleet: FleetDto;
  garage: Array<{ id: string; make: string; model: string; modelYear: number; plateNumber: string | null }>;
  direction: 'rtl' | 'ltr';
  locale: 'ar' | 'en';
  onChanged: () => void;
}) {
  const { t, theme } = useApp();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const inFleet = new Set(fleet.vehicles.map((v) => v.vehicleId));
  const addable = garage.filter((v) => !inFleet.has(v.id));

  async function addVehicle(vehicleId: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fleetsApi.addVehicle(fleet.id, vehicleId);
      onChanged();
    } catch (err) {
      setNotice(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function removeVehicle(vehicleId: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fleetsApi.removeVehicle(fleet.id, vehicleId);
      onChanged();
    } catch (err) {
      setNotice(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card testID={`fleet-card-${fleet.id}`}>
      <View style={styles.head}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>{fleet.name}</Text>
        <Badge text={fleet.isActive ? 'ACTIVE' : 'INACTIVE'} tone={fleet.isActive ? 'success' : 'neutral'} />
      </View>
      {fleet.contactPhone ? <DetailRow label={t('phone')} value={fleet.contactPhone} /> : null}
      <DetailRow
        label={t('fleetVehicles')}
        value={localizeDigits(fleet.vehicles.length, locale)}
      />
      <DetailRow
        label={t('fleetDrivers')}
        value={localizeDigits(fleet.drivers.length, locale)}
      />

      {fleet.vehicles.length > 0 ? (
        <View style={{ marginTop: space.sm }}>
          {fleet.vehicles.map((v) => (
            <View key={v.id} style={[styles.line, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <Text style={{ color: theme.textMuted, fontSize: typography.label, flex: 1 }}>
                {v.vehicleId.slice(0, 8)}
              </Text>
              <Button
                testID={`fleet-remove-${v.vehicleId}`}
                title={t('remove')}
                variant="ghost"
                disabled={busy}
                onPress={() => void removeVehicle(v.vehicleId)}
              />
            </View>
          ))}
        </View>
      ) : null}

      {addable.length > 0 ? (
        <View style={{ marginTop: space.sm }}>
          <Body size="caption" muted>
            {t('fleetAddVehicle')}
          </Body>
          {addable.slice(0, 5).map((v) => (
            <View key={v.id} style={[styles.line, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <Text style={{ color: theme.textMuted, fontSize: typography.label, flex: 1 }}>
                {`${v.make} ${v.model} ${localizeDigits(v.modelYear, locale)}`}
              </Text>
              <Button
                testID={`fleet-add-${v.id}`}
                title={t('add')}
                variant="secondary"
                disabled={busy}
                onPress={() => void addVehicle(v.id)}
              />
            </View>
          ))}
        </View>
      ) : null}

      {notice ? (
        <Body size="caption" muted style={{ marginTop: space.sm }}>
          {notice}
        </Body>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
});
