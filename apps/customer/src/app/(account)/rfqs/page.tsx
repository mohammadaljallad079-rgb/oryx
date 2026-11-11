'use client';

import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { SERVICE_CATEGORIES, customerApi } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { Alert, Button, Card, Field } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { RfqCard } from '@/components/rfq-card';

/**
 * Request for quotation.
 *
 * A consumer raises a request for a part that is not in the catalogue, approved
 * providers quote, and the consumer accepts exactly one quote. The account is
 * resolved from the bearer token, so the page sends no account id.
 *
 * The quotes a provider returns are also listed on "My quotations"; both
 * screens share `RfqCard` so the accept and cancel rules cannot drift.
 */
export default function RfqsPage() {
  return <RfqsContent />;
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
