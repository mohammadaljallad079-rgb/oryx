'use client';

import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Card } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { RfqCard } from '@/components/rfq-card';

/**
 * My quotations.
 *
 * The quote side of a request for quotation: every request that has attracted
 * at least one provider quote, with the same accept action the request screen
 * offers. Requests with no quote yet are filtered out, because this screen
 * answers "who quoted me", not "what did I ask for".
 *
 * The account is resolved from the bearer token, so no account id is sent.
 */
export default function QuotationsPage() {
  return <QuotationsContent />;
}

function QuotationsContent() {
  const { t } = useUi();
  const list = useAsync(() => customerApi.rfqs(), []);

  const quoted = (list.data?.items ?? []).filter((rfq) => rfq.quotes.length > 0);

  return (
    <div className="oryx-account-page">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('quotations.title')}
        subtitle={t('quotations.subtitle')}
      />

      {list.loading ? (
        <LoadingPanel rows={3} />
      ) : quoted.length === 0 ? (
        <Card>
          <StatePanel
            icon="clipboard"
            title={t('quotations.none')}
            message={t('quotations.noneHint')}
          />
        </Card>
      ) : (
        quoted.map((rfq) => (
          <RfqCard key={rfq.id} rfq={rfq} onChanged={() => void list.reload()} onError={() => undefined} />
        ))
      )}
    </div>
  );
}
