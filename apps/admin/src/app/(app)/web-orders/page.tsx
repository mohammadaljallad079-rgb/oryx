'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { SectionHeader, Card, TableShell, StatusBadge, Button, ErrorBanner } from '@/components/ui';

type WebOrdersResult = Awaited<ReturnType<typeof api.webOrders>>;
type WebOrder = WebOrdersResult['items'][number];

function deliveryText(address: unknown): string {
  if (!address || typeof address !== 'object' || Array.isArray(address)) return '—';
  const value = address as Record<string, unknown>;
  return ['addressLine1', 'addressLine2', 'area', 'city', 'postalCode']
    .map((key) => typeof value[key] === 'string' ? String(value[key]).trim() : '')
    .filter(Boolean).join('، ') || '—';
}

export default function WebsiteOrdersPage() {
  const { t, locale } = useUi();
  const { can } = useAuth();
  const allowed = can('erp.sales.read');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<WebOrdersResult | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(null);
    api.webOrders(page, 20)
      .then((result) => { if (active) setData(result); })
      .catch((err: unknown) => {
        if (active) { setData(null); setError(err instanceof Error ? err.message : 'Request failed'); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, page, refresh]);

  return (
    <div className="flex flex-col gap-4" data-testid="web-orders-page">
      <SectionHeader
        title={locale === 'ar' ? 'طلبات الموقع الإلكتروني' : 'Website Orders'}
        subtitle={locale === 'ar' ? 'طلبات قطع الغيار المسجلة من المتجر، منفصلة عن فواتير المبيعات الداخلية' : 'Customer web orders, separate from internal sales invoices'}
        actions={<Button onClick={() => setRefresh((n) => n + 1)}>{t('common.refresh')}</Button>}
      />
      {!allowed ? (
        <Card><p>{locale === 'ar' ? 'ليس لديك صلاحية قراءة المبيعات.' : 'You do not have sales read permission.'}</p></Card>
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => setRefresh((n) => n + 1)} />
      ) : loading ? (
        <Card><p>{t('common.loading')}</p></Card>
      ) : !data || data.items.length === 0 ? (
        <Card><p>{locale === 'ar' ? 'لا توجد طلبات موقع لهذه الشركة.' : 'There are no website orders for this company.'}</p></Card>
      ) : (
        <Card>
          <TableShell>
            <thead><tr>
              <th>{locale === 'ar' ? 'رقم الطلب' : 'Order'}</th>
              <th>{locale === 'ar' ? 'العميل' : 'Customer'}</th>
              <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
              <th>{t('common.status')}</th>
              <th>{locale === 'ar' ? 'الإجمالي' : 'Total'}</th>
              <th />
            </tr></thead>
            <tbody>
              {data.items.map((order: WebOrder) => (
                <tr key={order.id}>
                  <td dir="ltr">{order.orderNumber}</td>
                  <td>{order.contactName || '—'}</td>
                  <td>{new Date(order.createdAt).toLocaleString(locale === 'ar' ? 'ar-BH' : 'en-BH')}</td>
                  <td><StatusBadge status={order.status} label={order.status} /></td>
                  <td dir="ltr">{(order.totalMinor / 10 ** order.currencyScale).toFixed(order.currencyScale)} {order.currency}</td>
                  <td><Button size="sm" onClick={() => setExpanded((id) => id === order.id ? null : order.id)}>
                    {expanded === order.id ? (locale === 'ar' ? 'إخفاء' : 'Hide') : t('common.view')}
                  </Button>
                  {expanded === order.id ? (
                    <div className="mt-3 min-w-[260px] max-w-[480px] rounded-xl border border-[var(--border)] p-3 text-start text-sm">
                      <p><strong>{locale === 'ar' ? 'الهاتف:' : 'Phone:'}</strong> <span dir="ltr">{order.contactPhone}</span></p>
                      {order.contactEmail ? <p><strong>Email:</strong> {order.contactEmail}</p> : null}
                      <p><strong>{locale === 'ar' ? 'طريقة الاستلام:' : 'Fulfilment:'}</strong> {order.fulfilment}</p>
                      <p><strong>{locale === 'ar' ? 'عنوان التوصيل:' : 'Delivery address:'}</strong> {deliveryText(order.deliveryAddress)}</p>
                      {order.notes ? <p><strong>{locale === 'ar' ? 'ملاحظات:' : 'Notes:'}</strong> {order.notes}</p> : null}
                      <ul className="mt-2 list-disc ps-5">
                        {order.lines.map((line, i) => (
                          <li key={`${line.sku}-${i}`}>{(locale === 'ar' ? line.nameAr : line.nameEn) || line.sku} — {line.quantity} × {(line.unitPriceMinor / 10 ** order.currencyScale).toFixed(order.currencyScale)} {order.currency}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          {data.total > data.pageSize ? (
            <div className="flex items-center justify-center gap-3 p-4">
              <Button disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>{locale === 'ar' ? 'السابق' : 'Previous'}</Button>
              <span>{page} / {Math.ceil(data.total / data.pageSize)}</span>
              <Button disabled={page * data.pageSize >= data.total} onClick={() => setPage((v) => v + 1)}>{locale === 'ar' ? 'التالي' : 'Next'}</Button>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
