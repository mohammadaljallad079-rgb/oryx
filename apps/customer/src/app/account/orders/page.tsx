'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { customerApi, type WebOrder } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Alert, EmptyState, Loading, Money, PageHead, StatusBadge, formatDate } from '@/components/ui';

/** The signed-in customer's spare-parts orders, newest first. */
export default function AccountOrdersPage() {
  return (
    <RequireCustomer>
      <OrdersView />
    </RequireCustomer>
  );
}

function OrdersView() {
  const { t, locale } = useUi();
  const orders = useAsync(() => customerApi.orders(1, 50), []);
  const [selected, setSelected] = useState<WebOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (id: string) => {
    setError(null);
    try {
      setSelected(await customerApi.order(id));
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <>
      <PageHead
        title={t('orders.title')}
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('orders.title') }]}
      />
      <section className="oryx-section">
        <div className="oryx-container">
          {error && (
            <div style={{ marginBottom: 16 }}>
              <Alert>{error}</Alert>
            </div>
          )}
          {orders.loading ? (
            <Loading />
          ) : !orders.data || orders.data.items.length === 0 ? (
            <EmptyState
              message={t('orders.none')}
              action={
                <Link href="/store" className="oryx-btn oryx-btn-primary">
                  {t('nav.store')}
                </Link>
              }
            />
          ) : (
            <div className="oryx-grid oryx-grid-2">
              {orders.data.items.map((order) => (
                <div className="oryx-card" key={order.id} data-testid="order-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong>{order.orderNumber}</strong>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="oryx-muted" style={{ marginTop: 8 }}>
                    {formatDate(order.createdAt, locale)} · {t('orders.items', { count: order.itemCount ?? 0 })}
                  </div>
                  <div className="oryx-price" style={{ marginTop: 10 }}>
                    <Money minor={order.totalMinor} currency={order.currency} scale={order.currencyScale} />
                  </div>
                  <div className="oryx-service-actions" style={{ marginTop: 12 }}>
                    <button type="button" className="oryx-btn" onClick={() => void open(order.id)}>
                      {t('orders.viewDetail')}
                    </button>
                  </div>

                  {selected?.id === order.id && (
                    <table className="oryx-table" style={{ marginTop: 14 }}>
                      <thead>
                        <tr>
                          <th>{t('store.details')}</th>
                          <th>{t('cart.quantity')}</th>
                          <th>{t('cart.total')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.lines.map((line) => (
                          <tr key={line.sku}>
                            <td>{locale === 'ar' ? line.nameAr : line.nameEn}</td>
                            <td>{line.quantity}</td>
                            <td>
                              <Money
                                minor={line.lineTotalMinor}
                                currency={selected.currency}
                                scale={selected.currencyScale}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
