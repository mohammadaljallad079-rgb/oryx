'use client';

import { useCallback, useEffect, useState } from 'react';
import { documentStatusLabelKey } from '@oryx/shared';
import { api, type OfficialDocumentDto, type OfficialDocumentDetailDto } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Modal, Skeleton, TableShell } from '@/components/ui';

/**
 * The issued-document register for one source record.
 *
 * Shared by the inspection workspace and the documents page, so a report is
 * issued, opened and withdrawn through exactly one code path. The panel never
 * composes a PDF itself: it asks the API to issue one and then links to the
 * stored copy, which is what keeps the register and the printed page in step.
 */

export interface DocumentsPanelProps {
  /** The record the documents belong to, e.g. `InspectionSession`. */
  sourceType: string;
  sourceId: string;
  /** Shown when the register is empty. */
  emptyHint?: string;
  /** Rendered above the list, e.g. an "issue report" action. */
  actions?: React.ReactNode;
  /** Bumped by the parent to force a reload after it issues a document. */
  refreshKey?: number;
  onChanged?: () => void;
}

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  ISSUED: 'success',
  REVOKED: 'danger',
  SUPERSEDED: 'warning',
  CANCELLED: 'danger',
};

export function DocumentsPanel({
  sourceType,
  sourceId,
  emptyHint,
  actions,
  refreshKey = 0,
  onChanged,
}: DocumentsPanelProps) {
  const { t, locale } = useUi();
  const { can } = useAuth();

  const [documents, setDocuments] = useState<OfficialDocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OfficialDocumentDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revoking, setRevoking] = useState<OfficialDocumentDto | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const canRead = can('erp.inspection.read') || can('erp.sales.read') || can('erp.accounting.read');
  const canRevoke = canRead;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDocuments(await api.documentsForSource(sourceType, sourceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [sourceType, sourceId, t]);

  useEffect(() => {
    if (canRead) void load();
  }, [load, canRead, refreshKey]);

  const openDocument = async (row: OfficialDocumentDto) => {
    setDetailLoading(true);
    setError(null);
    try {
      // Fetch the trail and the bytes together: a document whose PDF cannot be
      // fetched should say so here rather than opening an empty tab.
      const [record, url] = await Promise.all([api.officialDocument(row.id), api.officialDocumentBlobUrl(row.id)]);
      setDetail(record);
      window.open(url, '_blank', 'noopener,noreferrer');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setDetailLoading(false);
    }
  };

  const copyLink = async (row: OfficialDocumentDto) => {
    try {
      await navigator.clipboard.writeText(row.verificationUrl);
      setNotice(t('documents.copied'));
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setNotice(row.verificationUrl);
    }
  };

  const confirmRevoke = async () => {
    if (!revoking || reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokeOfficialDocument(revoking.id, reason.trim());
      setRevoking(null);
      setReason('');
      setNotice(t('documents.revoked'));
      setTimeout(() => setNotice(null), 2500);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (!canRead) return null;

  return (
    <Card data-testid="documents-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="oryx-card-title m-0">{t('documents.title')}</h2>
          <p className="oryx-faint m-0 text-[12px]">{t('documents.verifyHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}
      {notice ? (
        <p className="oryx-gold m-0 text-[12.5px]" role="status">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <Skeleton height={64} />
      ) : documents.length === 0 ? (
        <EmptyState title={t('documents.notIssued')} hint={emptyHint ?? t('documents.empty')} />
      ) : (
        <TableShell label={t('documents.title')}>
          <table className="oryx-table" data-testid="documents-table">
            <thead>
              <tr>
                <th>{t('documents.number')}</th>
                <th>{t('documents.type')}</th>
                <th>{t('documents.version')}</th>
                <th>{t('documents.status')}</th>
                <th>{t('documents.issuedAt')}</th>
                <th aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {documents.map((row) => (
                <tr key={row.id} data-testid={`document-row-${row.id}`}>
                  <td className="num font-semibold">{row.documentNumber}</td>
                  <td>{t(`documents.type.${row.type}`)}</td>
                  <td className="num">v{row.version}</td>
                  <td>
                    <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
                      {(() => {
                        // A status with no dictionary entry renders the neutral
                        // "unknown" label rather than the raw enum, so a new
                        // value never shows as a bare English token in Arabic.
                        const key = documentStatusLabelKey(row.status);
                        return key ? t(key) : t('documents.status.unknown');
                      })()}
                    </Badge>
                  </td>
                  <td className="num text-[12px]">{new Date(row.issuedAt).toLocaleString(locale)}</td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!row.downloadable || detailLoading}
                        onClick={() => void openDocument(row)}
                        data-testid={`document-open-${row.id}`}
                      >
                        <Icon name="scroll" size={14} />
                        {t('documents.open')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void copyLink(row)}>
                        <Icon name="globe" size={14} />
                        {t('documents.copyLink')}
                      </Button>
                      {canRevoke && row.status === 'ISSUED' ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setRevoking(row);
                            setReason('');
                          }}
                          data-testid={`document-revoke-${row.id}`}
                        >
                          {t('documents.revoke')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {detail ? (
        <div className="mt-3 rounded border border-[var(--border)] p-3" data-testid="document-detail">
          <div className="flex items-center justify-between">
            <strong>{t('documents.eventTrail')}</strong>
            <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
              {t('common.close')}
            </Button>
          </div>
          <p className="oryx-faint m-0 text-[12px]">
            {detail.documentNumber} · v{detail.version} · {detail.pageCount ?? 0} {t('documents.pages')}
          </p>
          <ul className="m-0 mt-2 list-none p-0">
            {detail.events.map((event) => (
              <li key={event.id} className="flex justify-between border-b border-[var(--border)] py-1 text-[12.5px]">
                <span>{t(`documents.event.${event.event}`)}</span>
                <span className="oryx-faint num">{new Date(event.createdAt).toLocaleString(locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Modal
        open={revoking !== null}
        title={t('documents.revokeTitle')}
        onClose={() => setRevoking(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void confirmRevoke()}
              data-testid="document-revoke-confirm"
            >
              {t('documents.revokeConfirm')}
            </Button>
          </>
        }
      >
        <p className="oryx-muted m-0">{t('documents.revokeHint')}</p>
        <Field label={t('documents.revokeReason')} required>
          <input
            className="oryx-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            data-testid="document-revoke-reason"
          />
        </Field>
      </Modal>
    </Card>
  );
}
