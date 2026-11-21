import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { api, ApiError } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { useAsync } from '../../lib/use-async';
import { displayName, formatMoney, toBasisPoints, toMinor, toScaledQuantity, today } from '../../lib/format';
import { currencyScale } from '@oryx/shared';
import { Button, Card, Field, Heading, Screen, SectionTitle, StateView } from '../../components/ui';
import { space, typography } from '../../lib/theme';

interface Line {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discount: string;
}

interface ProductRow {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  salesPriceMinor: number;
  type: string;
}

interface CustomerRow {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
}

const emptyLine = (): Line => ({
  productId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  taxRate: '10',
  discount: '0',
});

/**
 * Sales invoice builder.
 *
 * The form posts to `POST /sales/invoices` with the exact shape the API expects:
 * money as integer minor units, quantity scaled by 10^4, and percentages in basis
 * points. Every conversion goes through the shared helpers so a three-decimal
 * currency and a percentage cannot be silently mis-scaled.
 *
 * Posting an invoice moves the ledger and, when `issueStock` is set, the stock
 * ledger too — both inside the API's transaction. The app does not attempt any of
 * that locally.
 */
export default function InvoiceScreen() {
  const { theme, t, locale, can, currency } = useApp();
  const allowed = can('erp.sales.invoice.manage');

  const customers = useAsync(
    () => api.list<CustomerRow>('/sales/customers', { pageSize: 100 }),
    [],
  );
  const products = useAsync(() => api.list<ProductRow>('/inventory/products', { pageSize: 100 }), []);

  const [customerId, setCustomerId] = useState<string>('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const gross = toMinor(line.unitPrice || '0', currency) * toScaledQuantity(line.quantity || '0');
      // Quantity is scaled by 10^4, so the product must be divided back down.
      const net = Math.round(gross / 10_000);
      const discount = Math.round((net * toBasisPoints(line.discount || '0')) / 10_000);
      const taxable = net - discount;
      subtotal += taxable;
      tax += Math.round((taxable * toBasisPoints(line.taxRate || '0')) / 10_000);
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [lines, currency]);

  if (!allowed) {
    return (
      <Screen scroll={false}>
        <Stack.Screen options={{ headerShown: true, title: t('newInvoiceTitle') }} />
        <StateView kind="error" message={t('noPermission')} />
      </Screen>
    );
  }

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const submit = async () => {
    setError(null);
    setDone(null);
    if (!customerId) {
      setError(t('required'));
      return;
    }
    const usable = lines.filter((line) => line.productId && Number(line.quantity) > 0);
    if (usable.length === 0) {
      setError(t('linesRequired'));
      return;
    }
    setBusy(true);
    try {
      const created = await api.createInvoice({
        customerId,
        invoiceDate: today(),
        currency,
        notes: notes || undefined,
        lines: usable.map((line) => ({
          productId: line.productId,
          description: line.description || line.productId,
          quantity: toScaledQuantity(line.quantity),
          unitPriceMinor: toMinor(line.unitPrice, currency),
          taxPercentBp: toBasisPoints(line.taxRate),
          discountPercentBp: toBasisPoints(line.discount),
        })),
      });
      setDone(created.invoiceNumber ?? created.id);
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
      <Stack.Screen options={{ headerShown: true, title: t('newInvoiceTitle') }} />
      <Heading>{t('newInvoiceTitle')}</Heading>

      <Card>
        <SectionTitle>{t('selectCustomer')}</SectionTitle>
        {customers.loading ? (
          <StateView kind="loading" />
        ) : (
          <View style={{ gap: space.xs }}>
            {(customers.data?.items ?? []).slice(0, 40).map((customer) => {
              const active = customer.id === customerId;
              return (
                <Text
                  key={customer.id}
                  onPress={() => setCustomerId(customer.id)}
                  style={{
                    color: active ? theme.gold : theme.text,
                    fontWeight: active ? '700' : '400',
                    paddingVertical: space.xs,
                  }}
                >
                  {active ? '● ' : '○ '}
                  {displayName(customer, locale)} · {customer.code}
                </Text>
              );
            })}
          </View>
        )}
      </Card>

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
                  onPress={() =>
                    setLine(index, {
                      productId: product.id,
                      description: displayName(product, locale),
                      unitPrice: String(
                        product.salesPriceMinor / 10 ** currencyScale(currency),
                      ),
                    })
                  }
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
          <Field
            label={t('unitPrice')}
            value={line.unitPrice}
            onChangeText={(value) => setLine(index, { unitPrice: value })}
            keyboardType="decimal-pad"
          />
          <Field
            label={t('taxRate')}
            value={line.taxRate}
            onChangeText={(value) => setLine(index, { taxRate: value })}
            keyboardType="decimal-pad"
          />
          <Field
            label={t('discount')}
            value={line.discount}
            onChangeText={(value) => setLine(index, { discount: value })}
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

      <Card style={{ marginTop: space.md }}>
        <SectionTitle>{t('total')}</SectionTitle>
        <Text style={{ color: theme.textMuted }}>
          {t('subtotal')}: {formatMoney(totals.subtotal, currency)}
        </Text>
        <Text style={{ color: theme.textMuted }}>
          {t('tax')}: {formatMoney(totals.tax, currency)}
        </Text>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.heading, marginTop: space.xs }}>
          {formatMoney(totals.total, currency)}
        </Text>
      </Card>

      <Field label={t('notes')} value={notes} onChangeText={setNotes} multiline />

      {error ? <Text style={{ color: theme.danger, marginBottom: space.md }}>{error}</Text> : null}
      {done ? (
        <Text style={{ color: theme.success, marginBottom: space.md }}>
          {t('invoiceCreated')}: {done}
        </Text>
      ) : null}

      <Button title={t('postInvoice')} onPress={submit} loading={busy} testID="invoice-submit" />
      <View style={{ height: space.md }} />
      <Button title={t('cancel')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
