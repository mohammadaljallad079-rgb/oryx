'use client';

import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { customerApi, type CustomerReturnRecord } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { Alert, Button, Card, StatusBadge, formatDate } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel, TableWrap } from '@/components/premium';

/**
 * Consumer order returns (P4).
 *
 * The list is the caller's own returns; the account is resolved from the bearer
 * token, so the page sends no account id. Cancellation is offered only while the
 * server still reports the return as cancellable — the client does not decide
 * that, the API does.
 */
export default function ReturnsPage() {
  return (
    <ReturnsContent />
  );
}

function ReturnsContent() {
  const { t, locale } = useUi();
  const list = useAsync(() => customerApi.returns(), []);
  const [failure, setFailure] = useState<string | null>(null);

  const items = list.data?.items ?? [];

  async function cancel(id: string) {
    setFailure(null);
    try {
      await customerApi.cancelReturn(id);
      await list.reload();
    } catch (err) {
      setFailure(messageOf(err));
    }
  }

  return (
    <div className="oryx-account-page">
      <PageHeader eyebrow={t('brand.tagline')} title={t('returns.title')} subtitle={t('returns.subtitle')} />

      {failure ? (
        <div style={{ marginBottom: 16 }}>
          <Alert>{failure}</Alert>
        </div>
      ) : null}

      <Card>
        {list.loading ? (
          <LoadingPanel rows={4} />
        ) : items.length === 0 ? (
          <StatePanel icon="file" title={t('returns.none')} message={t('returns.noneHint')} />
        ) : (
          <TableWrap>
            <table className="oryx-table">
              <thead>
                <tr>
                  <th>{t('returns.reference')}</th>
                  <th>{t('returns.order')}</th>
                  <th>{t('returns.reason')}</th>
                  <th>{t('returns.lines')}</th>
                  <th>{t('returns.status')}</th>
                  <th>{t('returns.requested')}</th>
                  <th aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} data-testid={`return-${row.id}`}>
                    <td dir="ltr">
                      <span className="oryx-mono">{row.reference}</span>
                    </td>
                    <td dir="ltr">{row.orderReference ?? row.orderId}</td>
                    <td>{row.reason}</td>
                    <td>{row.lines.length}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>{formatDate(row.requestedAt, locale)}</td>
                    <td>
                      {row.cancellable ? (
                        <Button variant="ghost" onClick={() => void cancel(row.id)} data-testid={`return-cancel-${row.id}`}>
                          {t('returns.cancel')}
                        </Button>
                      ) : null}
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

export type { CustomerReturnRecord };
