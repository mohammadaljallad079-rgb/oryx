import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { useMerchantSession } from '../../lib/merchant-session';
import { AppHeader } from '../../components/brand';
import {
  Badge,
  Body,
  Button,
  Card,
  Chip,
  DetailRow,
  Divider,
  Field,
  Heading,
  Notice,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';
import {
  ApiError,
  providerApi,
  type DocumentVerification,
  type OfficialDocument,
  type OfficialDocumentDetail,
} from '../../lib/api';

/**
 * The merchant document register.
 *
 * A merchant reads the official documents the platform issued for *its own*
 * company — tax invoices, quotations, purchase invoices, receipts, statements
 * and inspection reports. Everything comes from `/provider/documents`, which
 * resolves the company from the signed-in staff account's provider membership:
 * no company id is sent, so there is nothing on this screen that can be edited
 * into a read of another tenant's documents.
 *
 * ## Why a document is not "downloaded" through fetch
 *
 * The stored PDF is served from a `no-store` route behind the staff token, and a
 * device browser cannot be handed an `Authorization` header. Opening the file URL
 * therefore lands on a `401` unless the session is carried by a cookie. The
 * screen is honest about this: it shows the metadata, the QR verification view
 * and a *copyable* verification link, and it opens the file URL for a session
 * that a browser can carry. It never fabricates a preview it cannot fetch.
 */

/** A human label for a document type, in the active locale. */
function typeLabel(type: string, locale: string): string {
  const ar: Record<string, string> = {
    VEHICLE_INSPECTION_REPORT: 'تقرير فحص المركبات',
    SALES_INVOICE: 'فاتورة ضريبية',
    PURCHASE_INVOICE: 'فاتورة مشتريات',
    SALES_ORDER: 'طلب بيع',
    PURCHASE_ORDER: 'أمر شراء',
    SALES_RETURN: 'مرتجع بيع',
    PURCHASE_RETURN: 'مرتجع مشتريات',
    PAYMENT_RECEIPT: 'سند قبض',
    PAYMENT_VOUCHER: 'سند صرف',
    QUOTATION: 'عرض سعر',
    CUSTOMER_STATEMENT: 'كشف حساب عميل',
    SUPPLIER_STATEMENT: 'كشف حساب مورد',
    JOURNAL_ENTRY: 'قيد محاسبي',
  };
  const en: Record<string, string> = {
    VEHICLE_INSPECTION_REPORT: 'Inspection report',
    SALES_INVOICE: 'Tax invoice',
    PURCHASE_INVOICE: 'Purchase invoice',
    SALES_ORDER: 'Sales order',
    PURCHASE_ORDER: 'Purchase order',
    SALES_RETURN: 'Sales return',
    PURCHASE_RETURN: 'Purchase return',
    PAYMENT_RECEIPT: 'Payment receipt',
    PAYMENT_VOUCHER: 'Payment voucher',
    QUOTATION: 'Quotation',
    CUSTOMER_STATEMENT: 'Customer statement',
    SUPPLIER_STATEMENT: 'Supplier statement',
    JOURNAL_ENTRY: 'Journal entry',
  };
  return (locale === 'ar' ? ar[type] : en[type]) ?? type;
}

const STATUS_TONE: Record<string, 'gold' | 'neutral' | 'success' | 'danger'> = {
  ISSUED: 'success',
  SUPERSEDED: 'gold',
  CANCELLED: 'danger',
  REVOKED: 'danger',
  DRAFT: 'neutral',
};

export default function MerchantDocuments() {
  const { t, theme, locale, direction, account } = useApp();
  const { isSignedIn } = useMerchantSession();

  const [rows, setRows] = useState<OfficialDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [detail, setDetail] = useState<OfficialDocumentDetail | null>(null);
  const [verification, setVerification] = useState<DocumentVerification | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const demoMerchant = account?.role === 'merchant';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await providerApi.documents({
        search: search.trim() || undefined,
        type: type ?? undefined,
        pageSize: 50,
      });
      setRows(page.items);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('serverError'));
    } finally {
      setLoading(false);
    }
  }, [search, type, t]);

  useEffect(() => {
    if (!isSignedIn) {
      setRows([]);
      setTotal(0);
      return;
    }
    void load();
  }, [isSignedIn, load]);

  const open = async (row: OfficialDocument) => {
    setBusyId(row.id);
    setError(null);
    setVerification(null);
    try {
      const record = await providerApi.document(row.id);
      setDetail(record);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('serverError'));
    } finally {
      setBusyId(null);
    }
  };

  const checkVerification = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      setVerification(await providerApi.documentVerification(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('serverError'));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Open the stored PDF in the device browser.
   *
   * The route needs the staff token, which a browser navigation cannot send. When
   * the platform serves the API on the same origin as the merchant session
   * cookie, the open succeeds; otherwise the browser reports a refusal, which the
   * screen surfaces rather than hiding.
   */
  const openPdf = async (id: string) => {
    const url = providerApi.documentFileUrl(id);
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        setNotice(t('documentPreviewUnavailable'));
        return;
      }
      await Linking.openURL(url);
    } catch {
      setNotice(t('documentPreviewUnavailable'));
    }
  };

  if (demoMerchant) {
    return (
      <Screen>
        <AppHeader />
        <Heading>{t('documentsTitle')}</Heading>
        <StateView kind="empty" message={t('documentsDemoHint')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader />
      <Heading>{t('documentsTitle')}</Heading>
      <Body muted style={{ marginBottom: space.md }}>
        {t('documentsSubtitle')}
      </Body>

      <Field
        label={t('search')}
        value={search}
        onChangeText={setSearch}
        placeholder={t('documentsSearchPlaceholder')}
        autoCapitalize="characters"
        returnKeyType="search"
        onSubmitEditing={() => void load()}
      />

      <View style={[styles.chipRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
        <Chip label={t('all')} active={type === null} onPress={() => setType(null)} />
        {['SALES_INVOICE', 'QUOTATION', 'PURCHASE_INVOICE', 'PAYMENT_RECEIPT', 'VEHICLE_INSPECTION_REPORT'].map(
          (key) => (
            <Chip
              key={key}
              label={typeLabel(key, locale)}
              active={type === key}
              onPress={() => setType(type === key ? null : key)}
            />
          ),
        )}
      </View>

      <Notice text={notice} tone="muted" />
      {error ? <Notice text={error} tone="gold" /> : null}

      <SectionLabel>
        {localizeDigits(total, locale)} {t('results')}
      </SectionLabel>

      {loading ? <StateView kind="loading" /> : null}

      {!loading && rows.length === 0 ? (
        <StateView kind="empty" message={t('documentsEmpty')} />
      ) : null}

      <View style={{ gap: space.md }}>
        {rows.map((row) => (
          <Card key={row.id}>
            <View style={[styles.rowHead, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <Text style={{ color: theme.text, fontSize: typography.body, fontWeight: '700' }}>
                {row.documentNumber}
              </Text>
              <Badge text={row.status} tone={STATUS_TONE[row.status] ?? 'neutral'} />
            </View>
            <Body size="caption" muted>
              {typeLabel(row.type, locale)} · v{localizeDigits(row.version, locale)}
            </Body>
            <Divider />
            <View style={[styles.actions, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <Button
                title={t('view')}
                variant="secondary"
                loading={busyId === row.id}
                onPress={() => void open(row)}
              />
              <Button
                title={t('openPdf')}
                variant="secondary"
                onPress={() => void openPdf(row.id)}
              />
              <Button
                title={t('verify')}
                variant="secondary"
                onPress={() => void checkVerification(row.id)}
              />
            </View>
          </Card>
        ))}
      </View>

      {detail ? (
        <Card>
          <SectionLabel>{t('documentDetails')}</SectionLabel>
          <DetailRow label={t('documentNumber')} value={detail.documentNumber} />
          <DetailRow label={t('type')} value={typeLabel(detail.type, locale)} />
          <DetailRow label={t('status')} value={detail.status} />
          <DetailRow label={t('version')} value={String(detail.version)} />
          <DetailRow
            label={t('issuer')}
            value={locale === 'ar' ? detail.issuerNameAr : detail.issuerNameEn}
          />
          <DetailRow label={t('issuedAt')} value={detail.issuedAt.slice(0, 10)} />
          <DetailRow label={t('pages')} value={detail.pageCount ? String(detail.pageCount) : '—'} />
          <Divider />
          <SectionLabel>{t('documentTrail')}</SectionLabel>
          {detail.events.map((event) => (
            <DetailRow
              key={event.id}
              label={event.event}
              value={event.createdAt.slice(0, 19).replace('T', ' ')}
            />
          ))}
        </Card>
      ) : null}

      {verification ? (
        <Card>
          <SectionLabel>{t('verification')}</SectionLabel>
          <DetailRow
            label={t('status')}
            value={verification.view?.status ?? t('verificationNotFound')}
          />
          {verification.view ? (
            <>
              <DetailRow label={t('documentNumber')} value={verification.view.documentNumber} />
              <DetailRow
                label={t('type')}
                value={locale === 'ar' ? verification.view.typeLabelAr : verification.view.typeLabelEn}
              />
            </>
          ) : null}
          <Divider />
          <Button
            title={t('copyVerificationLink')}
            variant="secondary"
            onPress={() => setNotice(verification.verificationUrl)}
          />
          <Body size="caption" muted style={{ marginTop: space.xs }}>
            {verification.verificationUrl}
          </Body>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.md,
  },
  rowHead: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  actions: {
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.sm,
  },
});
