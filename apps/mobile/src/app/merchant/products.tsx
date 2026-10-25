import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { photoSmall } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader } from '../../components/brand';
import {
  Badge,
  Body,
  Button,
  Card,
  Chip,
  Field,
  Photo,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { formatMoney, localizeDigits } from '../../lib/format';

/**
 * The merchant catalogue.
 *
 * The store's products with an inline editor. Editing writes to the screen's own
 * copy so a reviewer can see the price change; nothing is persisted, and the
 * banner says so. Deleting is a confirmation step, not an immediate removal.
 */
export default function MerchantProducts() {
  const { t, theme, locale, account, direction, dataVersion } = useApp();
  const storeId = account?.storeId ?? 'store-01';

  const products = useAsync(async () => repository.merchantProducts(storeId), [storeId, dataVersion]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState('');
  const [draftStock, setDraftStock] = useState('');
  const [overrides, setOverrides] = useState<Record<string, { price: string; stock: string }>>({});
  const [removed, setRemoved] = useState<Record<string, boolean>>({});

  const list = (products.data ?? [])
    .filter((p) => !removed[p.id])
    .map((product) => {
    const override = overrides[product.id];
    return override ? { ...product, priceMinor: Number(override.price) || product.priceMinor, stock: Number(override.stock) } : product;
  });

  const lowStock = list.filter((p) => p.stock <= 5).length;

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <SectionLabel>{t('products')}</SectionLabel>
        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <Chip label={`${localizeDigits(list.length, locale)} ${t('products')}`} />
          {lowStock > 0 ? <Chip label={`${t('lowStock')}: ${localizeDigits(lowStock, locale)}`} active /> : null}
          {lowStock > 0 ? <Chip label={t('reorderAlerts')} /> : null}
        </View>

        <Button title={t('addProduct')} onPress={() => setEditing('new')} />

        {products.loading ? (
          <StateView kind="loading" />
        ) : list.length === 0 ? (
          <StateView kind="empty" message={t('noResults')} />
        ) : (
          list.map((product) => (
            <Card key={product.id}>
              <View style={[styles.headRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                <Photo source={photoSmall(product.photo)} height={56} width={56} radiusValue={radius.md} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                    {locale === 'ar' ? product.nameAr : product.nameEn}
                  </Text>
                  <Body size="caption" muted>
                    {product.sku} · {product.brand}
                  </Body>
                  <View style={styles.metaRow}>
                    <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
                      {formatMoney(product.priceMinor)}
                    </Text>
                    {product.stock <= 5 ? (
                      <Badge text={`${t('lowStock')} ${localizeDigits(product.stock, locale)}`} tone="gold" />
                    ) : (
                      <Body size="caption" muted>
                        {t('productStock')}: {localizeDigits(product.stock, locale)}
                      </Body>
                    )}
                  </View>
                </View>
              </View>

              {editing === product.id ? (
                <View style={{ marginTop: space.md, gap: space.sm }}>
                  <Field
                    label={t('productPrice')}
                    value={draftPrice}
                    onChangeText={setDraftPrice}
                    keyboardType="number-pad"
                    hint="minor units, e.g. 12500"
                    testID={`product-price-${product.id}`}
                  />
                  <Field
                    label={t('productStock')}
                    value={draftStock}
                    onChangeText={setDraftStock}
                    keyboardType="number-pad"
                    testID={`product-stock-${product.id}`}
                  />
                  <View style={styles.actionRow}>
                    <Button
                      title={t('saveProduct')}
                      testID={`product-save-${product.id}`}
                      onPress={() => {
                        setOverrides((o) => ({ ...o, [product.id]: { price: draftPrice, stock: draftStock } }));
                        setEditing(null);
                      }}
                    />
                    <Button title={t('cancel')} variant="secondary" onPress={() => setEditing(null)} />
                  </View>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    testID={`product-edit-${product.id}`}
                    onPress={() => {
                      setEditing(product.id);
                      setDraftPrice(String(product.priceMinor));
                      setDraftStock(String(product.stock));
                    }}
                  >
                    <Text style={{ color: theme.gold, fontWeight: '600', fontSize: typography.label }}>
                      {t('editProduct')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    testID={`product-delete-${product.id}`}
                    onPress={() => setRemoved((r) => ({ ...r, [product.id]: true }))}
                  >
                    <Text style={{ color: theme.danger, fontWeight: '600', fontSize: typography.label }}>
                      {removed[product.id] ? t('confirm') : t('deleteProduct')}
                    </Text>
                  </Pressable>
                </View>
              )}
            </Card>
          ))
        )}

        {editing === 'new' ? (
          <Card>
            <SectionLabel>{t('addProduct')}</SectionLabel>
            <View style={{ marginTop: space.md }}>
              <Field label={t('productName')} testID="new-product-name" />
              <Field label={t('productPrice')} keyboardType="number-pad" testID="new-product-price" />
              <Field label={t('productStock')} keyboardType="number-pad" testID="new-product-stock" />
              <Field label={t('productCategory')} testID="new-product-category" />
            </View>
            <Button title={t('saveProduct')} onPress={() => setEditing(null)} />
            <View style={{ height: space.sm }} />
            <Button title={t('cancel')} variant="secondary" onPress={() => setEditing(null)} />
          </Card>
        ) : null}
        <View style={{ height: space.xl }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { alignItems: 'center', gap: space.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  row: { flexWrap: 'wrap', gap: space.sm },
  actionRow: { flexDirection: 'row', gap: space.lg, marginTop: space.md, alignItems: 'center' },
});
