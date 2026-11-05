'use client';

import { useState } from 'react';
import { ISSUABLE_FINANCIAL_TYPES, OFFICIAL_DOCUMENTS } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { Badge, Button, Card, EmptyState, Field, SectionHeader } from '@/components/ui';
import { DocumentsPanel } from '@/components/documents-panel';

/**
 * The official-document register.
 *
 * A document is always issued from a source record — an approved inspection, an
 * invoice, an order — so this page asks for that record rather than accepting a
 * free-form document. That is what stops a PDF from being minted with figures
 * that no ledger entry backs.
 */
export default function DocumentsPage() {
  const { t } = useUi();
  const { can } = useAuth();

  const [sourceType, setSourceType] = useState('InspectionSession');
  const [sourceId, setSourceId] = useState('');
  const [lookup, setLookup] = useState<{ sourceType: string; sourceId: string } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const canIssueInspection = can('erp.inspection.read');
  const canIssueFinancial =
    can('erp.sales.read') || can('erp.purchasing.read') || can('erp.accounting.read');

  // Only the types the API can actually render from a stored record. The list
  // is the shared catalogue's, so the buttons here and the API's whitelist are
  // the same list and cannot drift.
  const financialTypes = OFFICIAL_DOCUMENTS.filter((doc) =>
    (ISSUABLE_FINANCIAL_TYPES as readonly string[]).includes(doc.type),
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const id = sourceId.trim();
    if (!id) return;
    setLookup({ sourceType, sourceId: id });
    setRefreshKey((k) => k + 1);
  };

  const issueInspection = async () => {
    if (!lookup) return;
    setIssuing(true);
    setIssueError(null);
    try {
      await api.issueInspectionDocument(lookup.sourceId);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setIssueError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setIssuing(false);
    }
  };

  const issueFinancial = async (type: string) => {
    if (!lookup) return;
    setIssuing(true);
    setIssueError(null);
    try {
      await api.issueFinancialDocument(type as never, lookup.sourceId);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setIssueError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="documents-page">
      <SectionHeader
        title={t('documents.title')}
        subtitle={t('documents.subtitle')}
        actions={<Badge tone="gold">{t('modules.available')}</Badge>}
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <Field label={t('documents.sourceType')}>
            <select
              className="oryx-input"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              data-testid="documents-source-type"
            >
              <option value="InspectionSession">{t('documents.source.InspectionSession')}</option>
              <option value="SalesInvoice">{t('documents.source.SalesInvoice')}</option>
              <option value="SalesOrder">{t('documents.source.SalesOrder')}</option>
              <option value="Quotation">{t('documents.source.Quotation')}</option>
              <option value="Payment">{t('documents.source.Payment')}</option>
            </select>
          </Field>
          <Field label={t('documents.sourceId')} hint={t('documents.sourceIdHint')}>
            <input
              className="oryx-input"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              dir="ltr"
              data-testid="documents-source-id"
            />
          </Field>
          <Button type="submit" variant="primary" data-testid="documents-lookup">
            <Icon name="search" size={14} />
            {t('common.search')}
          </Button>
        </form>
      </Card>

      {!lookup ? (
        <EmptyState title={t('documents.pickSource')} hint={t('documents.pickSourceHint')} />
      ) : (
        <DocumentsPanel
          sourceType={lookup.sourceType}
          sourceId={lookup.sourceId}
          refreshKey={refreshKey}
          actions={
            <>
              {lookup.sourceType === 'InspectionSession' && canIssueInspection ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={issuing}
                  onClick={() => void issueInspection()}
                  data-testid="documents-issue-report"
                >
                  <Icon name="plus" size={14} />
                  {t('documents.issueReport')}
                </Button>
              ) : null}
              {canIssueFinancial
                ? financialTypes.map((doc) => (
                    <Button
                      key={doc.type}
                      size="sm"
                      disabled={issuing}
                      onClick={() => void issueFinancial(doc.type)}
                      data-testid={`documents-issue-${doc.type}`}
                    >
                      {t(`documents.type.${doc.type}`)}
                    </Button>
                  ))
                : null}
            </>
          }
        />
      )}

      {issueError ? <p className="oryx-danger m-0 text-[12.5px]">{issueError}</p> : null}
    </div>
  );
}
