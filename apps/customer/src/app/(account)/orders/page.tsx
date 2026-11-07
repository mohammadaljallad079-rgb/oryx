'use client';

import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { Alert, Button, Card, Money, StatusBadge, formatDate } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel, TableWrap } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * Order history.
 *
 * The list is the caller's own orders — the API filters by the account in the
 * bearer token, so an id from another account is a 404 rather than a leak.
 * Cancellation is only offered while the server says the order is cancellable.
 */
export default function OrdersPage() {
  const { t, locale } = useUi();
  const orders = useAsync(() => customerApi.orders(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function cancel(id: string) {
    setError(null);
    setNotice(null);
    setBusy(id);
    try {
      await customerApi.cancelOrder(id, t('orders.cancel'));
      setNotice(t('orders.cancelled'));
      await orders.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  const items = orders.data?.items ?? [];

  return (
    <div className="oryx-account-page">
      <PageHeader
        eyebrow={t('account.nav.sectionCommerce')}
        title={t('orders.title')}
        subtitle={t('orders.subtitle')}
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {orders.loading ? (
        <LoadingPanel rows={3} />
      ) : orders.error ? (
        <StatePanel tone="error" icon="alert" title={t('common.error')} message={orders.error} />
      ) : items.length === 0 ? (
        <StatePanel icon="cart" title={t('orders.none')} message={t('orders.noneHint')} />
      ) : (
        <div className="oryx-orders">
          {items.map((order) => (
            <Card key={order.id} className="oryx-order">
              <header className="oryx-order__head">
                <div>
                  <p className="oryx-muted">{t('orders.reference')}</p>
                  <p className="oryx-order__ref" dir="ltr">
                    {order.reference}
                  </p>
                </div>
                <StatusBadge status={order.status} />
                <div className="oryx-order__meta">
                  <span className="oryx-muted">{formatDate(order.placedAt, locale)}</span>
                  <Money minor={order.totalMinor} currency={order.currency} />
                </div>
              </header>

              <TableWrap>
                <table className="oryx-table">
                  <thead>
                    <tr>
                      <th>{t('cart.item')}</th>
                      <th>{t('cart.quantity')}</th>
                      <th>{t('cart.lineTotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{locale === 'ar' ? line.nameAr : line.nameEn}</td>
                        <td>{line.quantity}</td>
                        <td>
                          <Money minor={line.lineTotalMinor} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>

              {order.cancellable && (
                <div className="oryx-order__actions">
                  <Button
                    variant="danger"
                    onClick={() => void cancel(order.id)}
                    disabled={busy === order.id}
                  >
                    <Icon name="close" size={15} />
                    {busy === order.id ? t('common.saving') : t('orders.cancel')}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
