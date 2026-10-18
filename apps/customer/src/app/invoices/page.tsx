'use client';

import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Card, Money, StatusBadge, formatDate } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel, TableWrap } from '@/components/premium';
import { Icon } from '@/components/icons';

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

  const items = payments.data?.items ?? [];
  const paid = items.filter((p) => p.status === 'SUCCEEDED' || p.status === 'PAID');
  const pending = items.filter((p) => p.status !== 'SUCCEEDED' && p.status !== 'PAID');
  const refunded = items.reduce((sum, p) => sum + p.refunds.length, 0);

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('invoices.title')}
        subtitle={t('invoices.subtitle')}
        art="/art/service-inspection.svg"
      />

      <div className="oryx-invoice-summary">
        <div className="oryx-invoice-summary__item">
          <span className="oryx-invoice-summary__label">{t('invoices.total')}</span>
          <span className="oryx-invoice-summary__value">{items.length}</span>
        </div>
        <div className="oryx-invoice-summary__item">
          <span className="oryx-invoice-summary__label">{t('invoices.settled')}</span>
          <span className="oryx-invoice-summary__value">{paid.length}</span>
        </div>
        <div className="oryx-invoice-summary__item">
          <span className="oryx-invoice-summary__label">{t('invoices.awaiting')}</span>
          <span className="oryx-invoice-summary__value">{pending.length}</span>
        </div>
        <div className="oryx-invoice-summary__item">
          <span className="oryx-invoice-summary__label">{t('invoices.refunds')}</span>
          <span className="oryx-invoice-summary__value">{refunded}</span>
        </div>
      </div>

      <Card>
        {payments.loading ? (
          <LoadingPanel rows={5} />
        ) : items.length === 0 ? (
          <StatePanel icon="wallet" title={t('invoices.none')} message={t('invoices.noneHint')} />
        ) : (
          <TableWrap>
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
                {items.map((payment) => (
                  <tr key={payment.id}>
                    <td dir="ltr">
                      <span className="oryx-mono">{payment.intentNumber}</span>
                    </td>
                    <td>{formatDate(payment.createdAt, locale)}</td>
                    <td>
                      <strong>
                        <Money
                          minor={payment.amountMinor}
                          currency={payment.currency}
                          scale={payment.currencyScale}
                        />
                      </strong>
                    </td>
                    <td>
                      <StatusBadge status={payment.status} />
                    </td>
                    <td>
                      {payment.refunds.length === 0 ? (
                        <span className="oryx-muted">—</span>
                      ) : (
                        <ul className="oryx-list">
                          {payment.refunds.map((refund) => (
                            <li
                              key={refund.id}
                              dir="ltr"
                              style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                            >
                              <Icon name="arrow" size={13} />
                              <span className="oryx-mono">{refund.refundNumber}</span>
                              <Money
                                minor={refund.amountMinor}
                                currency={payment.currency}
                                scale={payment.currencyScale}
                              />
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
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
