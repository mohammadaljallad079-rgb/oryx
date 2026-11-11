import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { photoSmall } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useMerchantSession } from '../../lib/merchant-session';
import {
  ApiError,
  inventoryApi,
  mediaUrl,
  productImagesApi,
  type InventoryProduct,
  type ProductImage,
  type UploadFile,
} from '../../lib/api';
import { capturePhoto, pickFromGallery } from '../../lib/photo-capture';
import { AppHeader } from '../../components/brand';
import {
  Badge,
  Body,
  Button,
  Card,
  Chip,
  Field,
  Notice,
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
 * Two modes, never mixed. A **live merchant session** lists the company's real
 * stock items (`/inventory/products`, staff plane — the API resolves the tenant
 * from the token) and attaches real photographs through the media library. The
 * **demo merchant** keeps the local, offline review experience.
 *
 * Product photographs go through the same authorized media pipeline as the admin
 * ERP: the API validates the MIME type and the size, stores the asset and
 * returns a served URL. The screen never writes a file path of its own.
 */
export default function MerchantProducts() {
  const { t, theme, locale, account, direction, dataVersion } = useApp();
  const { isSignedIn } = useMerchantSession();
  const storeId = account?.storeId ?? 'store-01';

  // ---- demo state (unchanged offline experience) ----------------------------
  const demoProducts = useAsync(async () => repository.merchantProducts(storeId), [storeId, dataVersion]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState('');
  const [draftStock, setDraftStock] = useState('');
  const [overrides, setOverrides] = useState<Record<string, { price: string; stock: string }>>({});
  const [removed, setRemoved] = useState<Record<string, boolean>>({});

  // ---- live state -----------------------------------------------------------
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [images, setImages] = useState<Record<string, ProductImage[]>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ nameEn: '', nameAr: '', sku: '', salesPriceMinor: '' });

  const loadLive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await inventoryApi.products({ pageSize: 200 });
      setProducts(page.items);
      // Load each product's photographs, primary first.
      const entries = await Promise.all(
        page.items.slice(0, 60).map(async (p) => {
          try {
            return [p.id, await productImagesApi.list(p.id)] as const;
          } catch {
            return [p.id, [] as ProductImage[]] as const;
          }
        }),
      );
      setImages(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('serverError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isSignedIn) {
      setProducts([]);
      setImages({});
      return;
    }
    void loadLive();
  }, [isSignedIn, loadLive]);

  const primaryUrl = (id: string): string | null => {
    const list = images[id] ?? [];
    const primary = list.find((img) => img.isPrimary) ?? list[0];
    return mediaUrl(primary?.url);
  };

  /** Picks an image, uploads it and re-reads the product's images. */
  const uploadImage = async (productId: string, source: 'camera' | 'gallery') => {
    setBusy(true);
    setError(null);
    try {
      const result = source === 'camera' ? await capturePhoto() : await pickFromGallery();
      if (!result.ok) {
        if (result.reason !== 'cancelled') setNotice(t('uploadFailed'));
        return;
      }
      const file: UploadFile = {
        uri: result.uri,
        name: result.uri.split('/').pop() ?? 'product.jpg',
        mimeType: 'image/jpeg',
      };
      await productImagesApi.upload(productId, file, {
        isPrimary: (images[productId] ?? []).length === 0,
      });
      const fresh = await productImagesApi.list(productId);
      setImages((prev) => ({ ...prev, [productId]: fresh }));
      setNotice(t('productSaved'));
    } catch (err) {
      const key =
        err instanceof ApiError && err.kind === 'validation'
          ? 'imageTooLarge'
          : err instanceof ApiError && err.kind === 'forbidden'
            ? 'forbiddenBody'
            : 'uploadFailed';
      setError(t(key as never));
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async (productId: string, imageId: string) => {
    setBusy(true);
    setError(null);
    try {
      await productImagesApi.remove(productId, imageId);
      const fresh = await productImagesApi.list(productId);
      setImages((prev) => ({ ...prev, [productId]: fresh }));
    } catch {
      setError(t('serverError'));
    } finally {
      setBusy(false);
    }
  };

  const createLive = async () => {
    setBusy(true);
    setError(null);
    try {
      await inventoryApi.createProduct({
        sku: draft.sku,
        nameEn: draft.nameEn,
        nameAr: draft.nameAr,
        salesPriceMinor: Number(draft.salesPriceMinor) || 0,
      });
      setDraft({ nameEn: '', nameAr: '', sku: '', salesPriceMinor: '' });
      setEditing(null);
      await loadLive();
      setNotice(t('productSaved'));
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'validation' ? t('validationFailed') : t('serverError'));
    } finally {
      setBusy(false);
    }
  };

  // ---- demo list ------------------------------------------------------------
  const list = (demoProducts.data ?? [])
    .filter((p) => !removed[p.id])
    .map((product) => {
      const override = overrides[product.id];
      return override
        ? { ...product, priceMinor: Number(override.price) || product.priceMinor, stock: Number(override.stock) }
        : product;
    });
  const lowStock = list.filter((p) => p.stock <= 5).length;

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <SectionLabel>{t('products')}</SectionLabel>

        {error ? (
          <Body size="caption" align="center" style={{ color: theme.danger }}>
            {error}
          </Body>
        ) : null}

        {isSignedIn ? (
          <>
            <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <Chip label={`${localizeDigits(products.length, locale)} ${t('products')}`} />
            </View>
            <Button title={t('addProduct')} onPress={() => setEditing('new')} />

            {loading ? (
              <StateView kind="loading" />
            ) : products.length === 0 ? (
              <StateView kind="empty" message={t('noResults')} />
            ) : (
              products.map((product) => {
                const productImage = primaryUrl(product.id);
                const productImages = images[product.id] ?? [];
                return (
                  <Card key={product.id}>
                    <View style={[styles.headRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                      <Photo
                        source={photoSmall('partsStore')}
                        uri={productImage}
                        height={56}
                        width={56}
                        radiusValue={radius.md}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                          {locale === 'ar' ? product.nameAr : product.nameEn}
                        </Text>
                        <Body size="caption" muted>
                          {product.sku}
                        </Body>
                        <View style={styles.metaRow}>
                          <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
                            {formatMoney(product.salesPriceMinor)}
                          </Text>
                          {!product.isActive ? <Badge text={t('listingInactive')} tone="gold" /> : null}
                        </View>
                      </View>
                    </View>

                    <View style={[styles.actionRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                      <Button
                        testID={`product-image-camera-${product.id}`}
                        title={t('uploadImage')}
                        variant="secondary"
                        disabled={busy}
                        onPress={() => void uploadImage(product.id, 'camera')}
                      />
                      <Button
                        testID={`product-image-gallery-${product.id}`}
                        title={t('chooseFromGallery')}
                        variant="secondary"
                        disabled={busy}
                        onPress={() => void uploadImage(product.id, 'gallery')}
                      />
                    </View>
                    {productImages.length > 0 ? (
                      <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                        {productImages.map((img) => (
                          <Pressable
                            key={img.id}
                            accessibilityRole="button"
                            testID={`product-image-remove-${img.id}`}
                            disabled={busy}
                            onPress={() => void removeImage(product.id, img.id)}
                          >
                            <Photo source={photoSmall('partsStore')} uri={mediaUrl(img.url)} height={48} width={48} radiusValue={radius.sm} />
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <Body size="caption" muted>
                        {t('noImage')}
                      </Body>
                    )}
                  </Card>
                );
              })
            )}

            {editing === 'new' ? (
              <Card>
                <SectionLabel>{t('addProduct')}</SectionLabel>
                <View style={{ marginTop: space.md }}>
                  <Field
                    label={t('productName')}
                    testID="new-product-name"
                    value={draft.nameEn}
                    onChangeText={(nameEn) => setDraft((d) => ({ ...d, nameEn }))}
                  />
                  <Field
                    label={t('listingNameAr')}
                    testID="new-product-name-ar"
                    value={draft.nameAr}
                    onChangeText={(nameAr) => setDraft((d) => ({ ...d, nameAr }))}
                  />
                  <Field label={t('sku')} testID="new-product-sku" value={draft.sku} onChangeText={(sku) => setDraft((d) => ({ ...d, sku }))} />
                  <Field
                    label={t('productPrice')}
                    keyboardType="number-pad"
                    testID="new-product-price"
                    value={draft.salesPriceMinor}
                    onChangeText={(salesPriceMinor) => setDraft((d) => ({ ...d, salesPriceMinor }))}
                  />
                </View>
                <Button
                  title={t('saveProduct')}
                  loading={busy}
                  disabled={!draft.nameEn || !draft.nameAr || !draft.sku}
                  onPress={() => void createLive()}
                />
                <View style={{ height: space.sm }} />
                <Button title={t('cancel')} variant="secondary" onPress={() => setEditing(null)} />
              </Card>
            ) : null}
          </>
        ) : (
          <>
            <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <Chip label={`${localizeDigits(list.length, locale)} ${t('products')}`} />
              {lowStock > 0 ? <Chip label={`${t('lowStock')}: ${localizeDigits(lowStock, locale)}`} active /> : null}
              {lowStock > 0 ? <Chip label={t('reorderAlerts')} /> : null}
            </View>

            <Button title={t('addProduct')} onPress={() => setEditing('new')} />

            {demoProducts.loading ? (
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
          </>
        )}
        <Notice text={notice} />
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
