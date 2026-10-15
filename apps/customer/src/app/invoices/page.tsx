'use client';

import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Card, EmptyState, Loading, Money, StatusBadge, formatDate } from '@/components/ui';

/** Payment history with the refunds recorded against each payment. */
export default function InvoicesPage() {
  return (
    <RequireCustomer>
      <InvoicesContent />
    </RequireCustomer>
  );
}

function InvoicesContent() {
  const { t, locale } = useUi();
  const payments = useAsync(() => customerApi.payments(), []);

  return (
    <div className="oryx-container">
      <h1 className="oryx-section-title">{t('invoices.title')}</h1>

      <Card>
        {payments.loading ? (
          <Loading />
        ) : (payments.data?.items.length ?? 0) === 0 ? (
          <EmptyState message={t('invoices.none')} />
        ) : (
          <table className="oryx-table">
            <thead>
              <tr>
                <th>{t('invoices.number')}</th>
                <th>{t('common.date')}</th>
                <th>{t('common.amount')}</th>
                <th>{t('common.status')}</th>
                <th>{t('invoices.refunds')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.data?.items.map((payment) => (
                <tr key={payment.id}>
                  <td dir="ltr">{payment.intentNumber}</td>
                  <td>{formatDate(payment.createdAt, locale)}</td>
                  <td>
                    <Money
                      minor={payment.amountMinor}
                      currency={payment.currency}
                      scale={payment.currencyScale}
                    />
                  </td>
                  <td>
                    <StatusBadge status={payment.status} />
                  </td>
                  <td>
                    {payment.refunds.length === 0 ? (
                      <span className="oryx-muted">—</span>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {payment.refunds.map((refund) => (
                          <li key={refund.id} dir="ltr">
                            {refund.refundNumber} ·{' '}
                            <Money
                              minor={refund.amountMinor}
                              currency={payment.currency}
                              scale={payment.currencyScale}
                            />{' '}
                            <StatusBadge status={refund.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
