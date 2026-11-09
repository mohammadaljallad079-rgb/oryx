'use client';

import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { ApiError, customerApi, type RfqRecord } from '@/lib/api';
import { messageOf } from '@/lib/hooks';
import { Button, Card, Money, StatusBadge, formatDate } from '@/components/ui';

/**
 * One request for quotation with its quotes.
 *
 * Shared by the two account screens: "Request for quotation" raises and tracks
 * a request, and "My quotations" lists the quotes a provider has returned.
 * Keeping one card means a change to the accept/cancel rules cannot drift
 * between the two.
 *
 * Accepting a quote is exclusive and the server refuses a second acceptance, so
 * the button is offered only while the request is still open.
 */
export function RfqCard({
  rfq,
  onChanged,
  onError,
  quotesOnly = false,
}: {
  rfq: RfqRecord;
  onChanged: () => void;
  onError: (message: string) => void;
  quotesOnly?: boolean;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const decided = rfq.acceptedQuoteId !== null || rfq.status !== 'OPEN';

  async function accept(quoteId: string) {
    setBusy(true);
    try {
      await customerApi.acceptRfqQuote(rfq.id, quoteId);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t('rfq.acceptFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await customerApi.cancelRfq(rfq.id);
      onChanged();
    } catch (err) {
      onError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid={`rfq-card-${rfq.id}`}>
      <Card
        title={rfq.reference}
        subtitle={rfq.description}
        actions={<StatusBadge status={rfq.status} />}
      >
        <div className="oryx-stat-row">
          <div className="oryx-stat">
            <span className="oryx-stat__label">{t('rfq.created')}</span>
            <span className="oryx-stat__value">{formatDate(rfq.createdAt, locale)}</span>
          </div>
          {rfq.expiresAt ? (
            <div className="oryx-stat">
              <span className="oryx-stat__label">{t('rfq.expires')}</span>
              <span className="oryx-stat__value">{formatDate(rfq.expiresAt, locale)}</span>
            </div>
          ) : null}
          <div className="oryx-stat">
            <span className="oryx-stat__label">{t('rfq.quotes')}</span>
            <span className="oryx-stat__value">{rfq.quotes.length}</span>
          </div>
        </div>

        {rfq.quotes.length === 0 ? (
          <p className="oryx-muted">{t('rfq.noQuotes')}</p>
        ) : (
          <ul className="oryx-quote-list" data-testid={`rfq-quotes-${rfq.id}`}>
            {rfq.quotes.map((quote) => (
              <li
                key={quote.id}
                className="oryx-quote"
                data-testid={`rfq-quote-${quote.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 0',
                  borderTop: '1px solid var(--oryx-border)',
                }}
              >
                <div>
                  <strong>
                    <Money minor={quote.priceMinor} currency={quote.currency} />
                  </strong>
                  {quote.leadTimeDays !== null ? (
                    <span className="oryx-muted">
                      {' · '}
                      {t('rfq.leadTime')}: {quote.leadTimeDays} {t('rfq.days')}
                    </span>
                  ) : null}
                  {quote.note ? <p className="oryx-muted">{quote.note}</p> : null}
                </div>
                {rfq.acceptedQuoteId === quote.id ? (
                  <StatusBadge status="ACCEPTED" />
                ) : decided ? (
                  <StatusBadge status={quote.status} />
                ) : (
                  <Button disabled={busy} onClick={() => void accept(quote.id)} data-testid={`rfq-accept-${quote.id}`}>
                    {t('rfq.accept')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!quotesOnly && !decided ? (
          <div style={{ marginTop: 12 }}>
            <Button variant="ghost" disabled={busy} onClick={() => void cancel()}>
              {t('rfq.cancel')}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
