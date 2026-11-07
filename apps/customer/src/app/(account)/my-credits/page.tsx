'use client';

import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Card, Money, StatusBadge, formatDate } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel, TableWrap } from '@/components/premium';

/**
 * Credits.
 *
 * A credit is money the platform owes back to the customer, and the only place
 * the API records it is a refund against a payment intent
 * (`GET /customer/payments`, each intent carrying its refunds). There is no
 * top-up route and no locally incremented balance, so this screen shows the
 * real refund records — a refund that has been processed is a settled credit,
 * one that is requested or approved is still in flight.
 *
 * Amounts come from the payment's own currency and scale, so a multi-currency
 * account never shows a number in the wrong currency.
 */
export default function CreditsPage() {
  return <CreditsContent />;
}

/** A refund is a settled credit once it has been processed. */
const SETTLED = 'PROCESSED';

function CreditsContent() {
  const { t, locale } = useUi();
  const payments = useAsync(() => customerApi.payments(), []);

  const credits = (payments.data?.items ?? []).flatMap((payment) =>
    payment.refunds.map((refund) => ({
      ...refund,
      currency: payment.currency,
      currencyScale: payment.currencyScale,
      paymentNumber: payment.intentNumber,
      description: payment.description,
      raisedAt: payment.createdAt,
    })),
  );

  const settled = credits.filter((c) => c.status === SETTLED);
  const pending = credits.filter((c) => c.status !== SETTLED);
  const settledMinor = settled.reduce((sum, c) => sum + c.amountMinor, 0);
  const currency = credits[0]?.currency ?? 'BHD';
  const scale = credits[0]?.currencyScale ?? 3;

  return (
    <div className="oryx-account-page">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('storeCredit.title')}
        subtitle={t('storeCredit.subtitle')}
      />

      <div className="oryx-invoice-summary">
        <div className="oryx-invoice-summary__item">
          <span className="oryx-invoice-summary__label">{t('storeCredit.settled')}</span>
          <span className="oryx-invoice-summary__value">
            <Money minor={settledMinor} currency={currency} scale={scale} />
          </span>
        </div>
        <div className="oryx-invoice-summary__item">
          <span className="oryx-invoice-summary__label">{t('storeCredit.count')}</span>
          <span className="oryx-invoice-summary__value">{credits.length}</span>
        </div>
        <div className="oryx-invoice-summary__item">
          <span className="oryx-invoice-summary__label">{t('storeCredit.pending')}</span>
          <span className="oryx-invoice-summary__value">{pending.length}</span>
        </div>
      </div>

      <Card>
        {payments.loading ? (
          <LoadingPanel rows={4} />
        ) : credits.length === 0 ? (
          <StatePanel icon="wallet" title={t('storeCredit.none')} message={t('storeCredit.noneHint')} />
        ) : (
          <TableWrap>
            <table className="oryx-table">
              <thead>
                <tr>
                  <th>{t('storeCredit.reference')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('storeCredit.payment')}</th>
                  <th>{t('common.amount')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((credit) => (
                  <tr key={credit.id}>
                    <td dir="ltr">
                      <span className="oryx-mono">{credit.refundNumber}</span>
                    </td>
                    <td>{formatDate(credit.raisedAt, locale)}</td>
                    <td dir="ltr">
                      <span className="oryx-mono">{credit.paymentNumber}</span>
                    </td>
                    <td>
                      <strong>
                        <Money minor={credit.amountMinor} currency={credit.currency} scale={credit.currencyScale} />
                      </strong>
                    </td>
                    <td>
                      <StatusBadge status={credit.status} />
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
