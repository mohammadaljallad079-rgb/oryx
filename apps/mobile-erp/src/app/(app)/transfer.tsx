import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';

import { api, ApiError } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { useAsync } from '../../lib/use-async';
import { displayName, toScaledQuantity } from '../../lib/format';
import { Button, Card, Field, Heading, Screen, SectionTitle, StateView } from '../../components/ui';
import { space } from '../../lib/theme';

interface WarehouseRow {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
}

interface ProductRow {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string;
}

interface Line {
  productId: string;
  quantity: string;
}

const emptyLine = (): Line => ({ productId: '', quantity: '1' });

/**
 * Stock transfer builder.
 *
 * Creates a transfer and then posts it, which is the only path that moves stock:
 * the API records the paired movements through `InventoryService.recordMovement`
 * and locks the level rows, so the two warehouses cannot go inconsistent. The app
 * never adjusts a level directly.
 */
export default function TransferScreen() {
  const { theme, t, locale, can } = useApp();
  const allowed = can('erp.inventory.transfer.manage');

  const warehouses = useAsync(() => api.list<WarehouseRow>('/inventory/warehouses', { pageSize: 100 }), []);
  const products = useAsync(() => api.list<ProductRow>('/inventory/products', { pageSize: 100 }), []);

  const [fromWarehouseId, setFrom] = useState('');
  const [toWarehouseId, setTo] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const sameWarehouse = Boolean(fromWarehouseId && toWarehouseId && fromWarehouseId === toWarehouseId);
  const usableLines = useMemo(
    () => lines.filter((line) => line.productId && Number(line.quantity) > 0),
    [lines],
  );

  if (!allowed) {
    return (
      <Screen scroll={false}>
        <Stack.Screen options={{ headerShown: true, title: t('newTransferTitle') }} />
        <StateView kind="error" message={t('noPermission')} />
      </Screen>
    );
  }

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const submit = async () => {
    setError(null);
    setDone(null);
    if (!fromWarehouseId || !toWarehouseId) {
      setError(t('required'));
      return;
    }
    if (sameWarehouse) {
      setError(t('sameWarehouse'));
      return;
    }
    if (usableLines.length === 0) {
      setError(t('linesRequired'));
      return;
    }
    setBusy(true);
    try {
      const created = await api.createTransfer({
        fromWarehouseId,
        toWarehouseId,
        notes: notes || undefined,
        lines: usableLines.map((line) => ({
          productId: line.productId,
          quantity: toScaledQuantity(line.quantity),
        })),
      });
      // Posting is what moves the stock; a draft transfer changes nothing.
      const posted = await api.postTransfer(created.id);
      setDone(posted.transferNumber ?? created.id);
      setLines([emptyLine()]);
      setNotes('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: t('newTransferTitle') }} />
      <Heading>{t('newTransferTitle')}</Heading>

      {[
        { label: t('fromWarehouse'), value: fromWarehouseId, set: setFrom },
        { label: t('toWarehouse'), value: toWarehouseId, set: setTo },
      ].map((group) => (
        <Card key={group.label}>
          <SectionTitle>{group.label}</SectionTitle>
          <View style={{ gap: space.xs }}>
            {(warehouses.data?.items ?? []).map((warehouse) => {
              const active = warehouse.id === group.value;
              return (
                <Text
                  key={warehouse.id}
                  onPress={() => group.set(warehouse.id)}
                  style={{ color: active ? theme.gold : theme.text, fontWeight: active ? '700' : '400' }}
                >
                  {active ? '● ' : '○ '}
                  {displayName(warehouse, locale)} · {warehouse.code}
                </Text>
              );
            })}
          </View>
        </Card>
      ))}

      {sameWarehouse ? (
        <Text style={{ color: theme.danger, marginBottom: space.md }}>{t('sameWarehouse')}</Text>
      ) : null}

      {lines.map((line, index) => (
        <Card key={index}>
          <SectionTitle>
            {t('product')} {index + 1}
          </SectionTitle>
          <View style={{ gap: space.xs, marginBottom: space.md }}>
            {(products.data?.items ?? []).slice(0, 30).map((product) => {
              const active = product.id === line.productId;
              return (
                <Text
                  key={product.id}
                  onPress={() => setLine(index, { productId: product.id })}
                  style={{ color: active ? theme.gold : theme.textMuted, fontWeight: active ? '700' : '400' }}
                >
                  {active ? '● ' : '○ '}
                  {displayName(product, locale)} · {product.sku}
                </Text>
              );
            })}
          </View>
          <Field
            label={t('quantity')}
            value={line.quantity}
            onChangeText={(value) => setLine(index, { quantity: value })}
            keyboardType="decimal-pad"
          />
          {lines.length > 1 ? (
            <Button
              title={t('removeLine')}
              variant="danger"
              onPress={() => setLines((prev) => prev.filter((_, i) => i !== index))}
            />
          ) : null}
        </Card>
      ))}

      <Button title={t('addLine')} variant="secondary" onPress={() => setLines((prev) => [...prev, emptyLine()])} />

      <View style={{ height: space.md }} />
      <Field label={t('notes')} value={notes} onChangeText={setNotes} multiline />

      {error ? <Text style={{ color: theme.danger, marginBottom: space.md }}>{error}</Text> : null}
      {done ? (
        <Text style={{ color: theme.success, marginBottom: space.md }}>
          {t('transferPosted')}: {done}
        </Text>
      ) : null}

      <Button title={t('postTransfer')} onPress={submit} loading={busy} testID="transfer-submit" />
    </Screen>
  );
}
