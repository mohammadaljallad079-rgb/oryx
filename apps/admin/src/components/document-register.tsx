'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OFFICIAL_DOCUMENTS, documentStatusLabelKey } from '@oryx/shared';
import { api, type OfficialDocumentDto, type OfficialDocumentDetailDto } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useDebounced } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  Pagination,
  SectionHeader,
  Skeleton,
  TableShell,
} from '@/components/ui';

/**
 * The tenant-wide document register.
 *
 * Distinct from `DocumentsPanel`, which shows the documents of one source
 * record. This lists every official document the company has issued, with the
 * search and filters the API already supports, and reuses the same preview,
 * download, print and withdraw paths so there is one way to act on a document.
 *
 * The preview is an in-page iframe over a blob URL rather than `window.open`.
 * The bytes are fetched with the staff token, so the tab cannot be opened
 * synchronously: `window.open` after an `await` is no longer tied to the click
 * and the browser hands back a blank `about:blank` tab. Holding the blob in the
 * modal keeps the fetch, the print and the download on one stored copy.
 *
 * The register is scoped server-side: the API resolves the caller's company and
 * never accepts a company id, so a merchant can only ever read its own
 * documents.
 */

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  ISSUED: 'success',
  REVOKED: 'danger',
  SUPERSEDED: 'warning',
  CANCELLED: 'danger',
  DRAFT: 'neutral',
};

export function DocumentRegister() {
  const { t, locale } = useUi();
  const { can } = useAuth();

  const canRead =
    can('erp.inspection.read') || can('erp.sales.read') || can('erp.purchasing.read') || can('erp.accounting.read');
  const canRevoke = canRead;

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const [data, setData] = useState<{ items: OfficialDocumentDto[]; total: number; page: number; pageSize: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OfficialDocumentDetailDto | null>(null);
  const [preview, setPreview] = useState<{ url: string; document: OfficialDocumentDto } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [revoking, setRevoking] = useState<OfficialDocumentDto | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      setData(
        await api.documentsRegister({
          page,
          pageSize: 20,
          search: debounced || undefined,
          type: type || undefined,
          status: status || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [page, debounced, type, status, canRead, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDocument = async (row: OfficialDocumentDto) => {
    setDetailLoading(true);
    setError(null);
    try {
      // Fetch the trail and the bytes together: a document whose PDF cannot be
      // fetched should say so here rather than opening an empty preview.
      const [record, url] = await Promise.all([
        api.officialDocument(row.id),
        api.officialDocumentBlobUrl(row.id),
      ]);
      setDetail(record);
      setPreview({ url, document: row });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setDetailLoading(false);
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setDetail(null);
  };

  // Printing the frame prints the stored PDF through the browser's own viewer
  // rather than a re-render, so a print can never disagree with the copy on
  // file.
  const print = () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  const download = () => {
    if (!preview) return;
    const a = window.document.createElement('a');
    a.href = preview.url;
    a.download = `${preview.document.documentNumber}.pdf`;
    a.click();
  };

  // Direct row actions: fetch the stored PDF on demand and print or download it
  // without first opening the detail modal, so the operator never has to leave
  // the register to act on a row.
  const rowPrint = async (row: OfficialDocumentDto) => {
    setError(null);
    try {
      const url = await api.officialDocumentBlobUrl(row.id);
      const frame = window.document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.src = url;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      };
      window.document.body.appendChild(frame);
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const rowDownload = async (row: OfficialDocumentDto) => {
    setError(null);
    try {
      const url = await api.officialDocumentBlobUrl(row.id);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${row.documentNumber}.pdf`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
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
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (!canRead) return null;

  return (
    <Card data-testid="document-register">
      <SectionHeader title={t('documents.register.title')} subtitle={t('documents.register.subtitle')} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input
            className="oryx-input"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('documents.register.searchHint')}
            dir="ltr"
            data-testid="register-search"
          />
        </label>
        <label className="min-w-[170px]">
          <span className="oryx-label">{t('documents.type')}</span>
          <select
            className="oryx-select"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            data-testid="register-type"
          >
            <option value="">{t('documents.register.allTypes')}</option>
            {OFFICIAL_DOCUMENTS.map((doc) => (
              <option key={doc.type} value={doc.type}>
                {t(`documents.type.${doc.type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[170px]">
          <span className="oryx-label">{t('documents.status')}</span>
          <select
            className="oryx-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            data-testid="register-status"
          >
            <option value="">{t('documents.register.allStatuses')}</option>
            {['ISSUED', 'REVOKED', 'SUPERSEDED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {(() => {
                  const key = documentStatusLabelKey(s);
                  return key ? t(key) : s;
                })()}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={() => void load()} data-testid="register-refresh">
          <Icon name="search" size={14} />
          {t('common.refresh')}
        </Button>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}
      {notice ? (
        <p className="oryx-gold m-0 text-[12.5px]" role="status">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <Skeleton height={120} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title={t('documents.register.empty')} hint={t('documents.register.emptyHint')} />
      ) : (
        <>
          <TableShell label={t('documents.register.title')}>
            <thead>
              <tr>
                <th>{t('documents.number')}</th>
                <th>{t('documents.type')}</th>
                <th>{t('documents.version')}</th>
                <th>{t('documents.status')}</th>
                <th>{t('documents.pages')}</th>
                <th>{t('documents.issuedAt')}</th>
                <th aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} data-testid={`register-row-${row.documentNumber}`}>
                  <td className="num font-semibold">{row.documentNumber}</td>
                  <td>{t(`documents.type.${row.type}`)}</td>
                  <td className="num">v{row.version}</td>
                  <td>
                    <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
                      {(() => {
                        const key = documentStatusLabelKey(row.status);
                        return key ? t(key) : t('documents.status.unknown');
                      })()}
                    </Badge>
                  </td>
                  <td className="num">{row.pageCount ?? '—'}</td>
                  <td className="num text-[12px]">{new Date(row.issuedAt).toLocaleString(locale)}</td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!row.downloadable || detailLoading}
                        onClick={() => void openDocument(row)}
                        data-testid={`register-open-${row.documentNumber}`}
                      >
                        <Icon name="scroll" size={14} />
                        {t('documents.open')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!row.downloadable}
                        onClick={() => void rowPrint(row)}
                        data-testid={`register-print-row-${row.documentNumber}`}
                      >
                        <Icon name="print" size={14} />
                        {t('documents.print')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!row.downloadable}
                        onClick={() => void rowDownload(row)}
                        data-testid={`register-download-row-${row.documentNumber}`}
                      >
                        <Icon name="download" size={14} />
                        {t('documents.download')}
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
                          data-testid={`register-revoke-${row.documentNumber}`}
                        >
                          {t('documents.revoke')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={setPage}
            labels={{
              previous: t('common.previous'),
              next: t('common.next'),
              page: t('common.page'),
              of: t('common.of'),
            }}
          />
        </>
      )}

      {detail && preview ? (
        <Modal
          open
          title={`${t('documents.preview')} — ${preview.document.documentNumber}`}
          onClose={closePreview}
          footer={
            <>
              <Button variant="ghost" onClick={closePreview} data-testid="register-preview-close">
                {t('common.close')}
              </Button>
              <Button variant="ghost" onClick={download} data-testid="register-download">
                <Icon name="download" size={14} />
                {t('documents.download')}
              </Button>
              <Button variant="primary" onClick={print} data-testid="register-print">
                <Icon name="print" size={14} />
                {t('documents.print')}
              </Button>
            </>
          }
        >
          <iframe
            ref={frameRef}
            src={preview.url}
            title={preview.document.documentNumber}
            className="oryx-doc-preview"
            data-testid="register-frame"
          />
          <div className="mt-3 rounded border border-[var(--border)] p-3" data-testid="register-detail">
            <div className="flex items-center justify-between">
              <strong>{t('documents.eventTrail')}</strong>
            </div>
            <p className="oryx-faint m-0 text-[12px]">
              {detail.documentNumber} · v{detail.version} · {detail.pageCount ?? 0} {t('documents.pages')}
            </p>
            <ul className="m-0 mt-2 list-none p-0">
              {detail.events.map((event) => (
                <li
                  key={event.id}
                  className="flex justify-between border-b border-[var(--border)] py-1 text-[12.5px]"
                >
                  <span>{t(`documents.event.${event.event}`)}</span>
                  <span className="oryx-faint num">{new Date(event.createdAt).toLocaleString(locale)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
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
              data-testid="register-revoke-confirm"
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
            data-testid="register-revoke-reason"
          />
        </Field>
      </Modal>
    </Card>
  );
}
