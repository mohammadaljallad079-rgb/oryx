import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { useLiveSession } from '../lib/live-session';
import { useReloadOnFocus } from '../lib/use-reload-on-focus';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import {
  Body,
  Button,
  Card,
  Chip,
  DetailRow,
  Divider,
  Field,
  Notice,
  Screen,
  StateView,
} from '../components/ui';
import { space } from '../lib/theme';
import { ApiError, addressesApi, type CustomerAddress } from '../lib/api';

/**
 * Delivery addresses.
 *
 * With a **live session** this is real CRUD against `/customer/addresses`: create,
 * edit the label, set the default, delete. The API resolves the account from the
 * bearer token, so the client never sends an account id and one customer cannot
 * touch another's addresses. Without a session the demo list is shown under a
 * "Demo data" label.
 *
 * Setting a default is the server's job: it clears the previous default in the
 * same transaction, so two addresses cannot both claim it.
 */
export default function Addresses() {
  const { t, locale, direction, dataVersion } = useApp();
  const session = useLiveSession();
  const isLive = session.isLive;

  const demo = useAsync(
    async () => repository.addresses('demo-account'),
    [dataVersion],
  );

  const [items, setItems] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const load = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await addressesApi.list());
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [isLive, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useReloadOnFocus(() => void load(), isLive);

  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setLabel('');
    setLine1('');
    setLine2('');
    setCity('');
    setIsDefault(false);
  };

  const beginEdit = (address: CustomerAddress) => {
    setEditingId(address.id);
    setLabel(address.label ?? '');
    setLine1(address.addressLine1);
    setLine2(address.addressLine2 ?? '');
    setCity(address.city);
    setIsDefault(address.isDefault);
    setFormOpen(true);
  };

  const submit = async () => {
    if (busy) return;
    // The API validates too; this is the same rule so the user sees it inline.
    if (line1.trim().length < 2 || city.trim().length < 2) {
      setNotice(t('validationFailed'));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const payload = {
        label: label.trim() || undefined,
        addressLine1: line1.trim(),
        addressLine2: line2.trim() || undefined,
        city: city.trim(),
        isDefault,
      };
      if (editingId) await addressesApi.update(editingId, payload);
      else await addressesApi.create(payload);
      resetForm();
      setNotice(t('saved'));
      await load();
    } catch (err) {
      setNotice(
        err instanceof ApiError && err.kind === 'offline'
          ? t('offlineBody')
          : err instanceof ApiError && err.kind === 'validation'
            ? t('validationFailed')
            : t('serverError'),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await addressesApi.remove(id);
      setNotice(t('saved'));
      await load();
    } catch (err) {
      setNotice(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('serverError'));
    } finally {
      setBusy(false);
    }
  };

  const rowDirection = direction === 'rtl' ? 'row-reverse' : 'row';

  // ------------------------------------------------------------- live mode
  if (isLive) {
    return (
      <Screen>
        <ScreenHeader title={t('addresses')} subtitle={`${items.length}`} />

        {loading && items.length === 0 ? (
          <StateView kind="loading" />
        ) : error && items.length === 0 ? (
          <Card>
            <StateView kind="error" message={error} />
            <Button title={t('retry')} onPress={() => void load()} />
          </Card>
        ) : items.length === 0 ? (
          <StateView kind="empty" message={t('noAddresses')} />
        ) : (
          items.map((address) => (
            <Card key={address.id}>
              <View style={[styles.headRow, { flexDirection: rowDirection }]}>
                <Body size="label" style={{ fontWeight: '700' }}>
                  {address.label ?? address.city}
                </Body>
                {address.isDefault ? <Chip label={t('defaultAddress')} active /> : null}
              </View>
              <Divider />
              <DetailRow
                label={t('addresses')}
                value={`${address.addressLine1}${address.addressLine2 ? `, ${address.addressLine2}` : ''}, ${address.city}`}
              />
              <View style={[styles.actions, { flexDirection: rowDirection }]}>
                <Button title={t('edit')} variant="secondary" onPress={() => beginEdit(address)} />
                <Button title={t('delete')} variant="danger" disabled={busy} onPress={() => void remove(address.id)} />
              </View>
            </Card>
          ))
        )}

        {formOpen ? (
          <Card>
            <Field label={t('addressLabel')} value={label} onChangeText={setLabel} maxLength={40} />
            <Field label={t('addressLine1')} value={line1} onChangeText={setLine1} maxLength={200} />
            <Field label={t('addressLine2')} value={line2} onChangeText={setLine2} maxLength={200} />
            <Field label={t('city')} value={city} onChangeText={setCity} maxLength={120} />
            <Chip
              testID="address-default"
              label={t('defaultAddress')}
              active={isDefault}
              onPress={() => setIsDefault((v) => !v)}
            />
            <View style={[styles.actions, { flexDirection: rowDirection, marginTop: space.md }]}>
              <Button
                testID="address-save"
                title={t('save')}
                disabled={busy}
                onPress={() => void submit()}
              />
              <Button title={t('cancel')} variant="secondary" disabled={busy} onPress={resetForm} />
            </View>
          </Card>
        ) : (
          <Button testID="add-address" title={t('addAddress')} onPress={() => setFormOpen(true)} />
        )}

        <Notice text={notice} />
        <Body size="caption" muted align="center">
          {t('liveData')}
        </Body>
        <View style={{ height: space.xl }} />
      </Screen>
    );
  }

  // ------------------------------------------------------------- demo mode
  const demoItems = demo.data ?? [];
  return (
    <Screen>
      <ScreenHeader title={t('addresses')} />

      {demo.loading ? (
        <StateView kind="loading" />
      ) : demoItems.length === 0 ? (
        <StateView kind="empty" message={t('empty')} />
      ) : (
        demoItems.map((address) => (
          <Card key={address.id}>
            <View style={[styles.headRow, { flexDirection: rowDirection }]}>
              <Body size="label" style={{ fontWeight: '700' }}>
                {locale === 'ar' ? address.labelAr : address.labelEn}
              </Body>
              {address.isDefault ? <Chip label={t('defaultAddress')} active /> : null}
            </View>
            <Divider />
            <DetailRow label={t('addresses')} value={locale === 'ar' ? address.lineAr : address.lineEn} />
          </Card>
        ))
      )}

      <Button title={t('addAddress')} variant="secondary" onPress={() => setFormOpen(true)} />
      <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
        {t('demoNotice')}
      </Body>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { alignItems: 'center', justifyContent: 'space-between' },
  actions: { gap: space.sm, marginTop: space.sm },
});
