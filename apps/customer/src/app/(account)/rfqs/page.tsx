'use client';

import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { ApiError, SERVICE_CATEGORIES, customerApi, type RfqRecord } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { Alert, Button, Card, Field, Money, StatusBadge, formatDate } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';

/**
 * Requests for quotation (P4).
 *
 * A consumer raises a request for a part that is not in the catalogue, approved
 * providers quote, and the consumer accepts exactly one quote. The account is
 * resolved from the bearer token, so the page sends no account id. Accepting a
 * quote is exclusive and the server refuses a second acceptance; the accept
 * button is offered only while the request is open.
 */
export default function RfqsPage() {
  return (
    <RfqsContent />
  );
}

function RfqsContent() {
  const { t, locale } = useUi();
  const list = useAsync(() => customerApi.rfqs(), []);

  const [categoryKey, setCategoryKey] = useState<string>(SERVICE_CATEGORIES[0]?.key ?? 'spare_parts');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!description.trim()) {
      setFailure(t('rfq.required'));
      return;
    }
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      await customerApi.createRfq({
        categoryKey,
        description: description.trim(),
        quantity: Math.max(1, Number(quantity) || 1),
      });
      setDescription('');
      setQuantity('1');
      setNotice(t('rfq.submitted'));
      await list.reload();
    } catch (err) {
      setFailure(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const items = list.data?.items ?? [];

  return (
    <div className="oryx-account-page">
      <PageHeader eyebrow={t('brand.tagline')} title={t('rfq.title')} subtitle={t('rfq.subtitle')} />

      {failure ? (
        <div style={{ marginBottom: 16 }}>
          <Alert>{failure}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}

      <Card title={t('rfq.new')}>
        <form onSubmit={submit}>
          <Field label={t('rfq.category')}>
            <select
              className="oryx-select"
              value={categoryKey}
              onChange={(e) => setCategoryKey(e.target.value)}
              data-testid="rfq-category"
            >
              {SERVICE_CATEGORIES.map((category) => (
                <option key={category.key} value={category.key}>
                  {locale === 'ar' ? category.nameAr : category.nameEn}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('rfq.description')}>
            <textarea
              className="oryx-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              data-testid="rfq-description"
            />
          </Field>
          <Field label={t('rfq.quantity')}>
            <input
              className="oryx-input"
              type="number"
              min={1}
              max={999}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              data-testid="rfq-quantity"
            />
          </Field>
          <Button type="submit" variant="primary" disabled={busy || !description.trim()} data-testid="rfq-submit">
            {t('rfq.submit')}
          </Button>
        </form>
      </Card>

      {list.loading ? (
        <LoadingPanel rows={3} />
      ) : items.length === 0 ? (
        <Card>
          <StatePanel icon="clipboard" title={t('rfq.none')} message={t('rfq.noneHint')} />
        </Card>
      ) : (
        items.map((rfq) => (
          <RfqCard
            key={rfq.id}
            rfq={rfq}
            onChanged={() => void list.reload()}
            onError={(message) => setFailure(message)}
          />
        ))
      )}
    </div>
  );
}

function RfqCard({
  rfq,
  onChanged,
  onError,
}: {
  rfq: RfqRecord;
  onChanged: () => void;
  onError: (message: string) => void;
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

      {!decided ? (
        <div style={{ marginTop: 12 }}>
          <Button variant="ghost" disabled={busy} onClick={() => void cancel()}>
            {t('rfq.cancel')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
