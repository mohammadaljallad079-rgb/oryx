'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttachmentDto, AttachmentEntityType } from '@oryx/shared';
import { api, ApiError, type OfficialDocumentDto } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { useAuth } from '@/lib/auth-context';
import { Icon } from '@/components/icons';
import { Button, Modal } from '@/components/ui';

/**
 * Issue, preview, print and download the official document for one record.
 *
 * The register used to be reachable only from the documents page, which asks an
 * operator to paste a record id. That made "print this invoice" a copy-paste
 * task and left the sales register with no print path at all. This cell lives in
 * the register row instead: it resolves the document for the record it is given,
 * issues it on demand, and then offers the four actions an operator actually
 * needs.
 *
 * Nothing here composes a PDF. The bytes always come from
 * `GET /documents/:id/file`, so a preview and a print can never disagree with
 * the stored copy, and a document that was never issued cannot be previewed as
 * if it had been.
 */

/** A record's source type, as the API names it in `loadFinancialSource`. */
export type DocumentSourceType =
  | 'SalesInvoice'
  | 'Quotation'
  | 'SalesOrder'
  | 'CreditNote'
  | 'SupplierInvoice'
  | 'PurchaseOrder'
  | 'PurchaseReturn'
  | 'PosSale'
  | 'Payment'
  | 'Customer'
  | 'Supplier'
  | 'JournalEntry';

/** The issueable type a source record maps to. */
export type IssuableDocumentType =
  | 'SALES_INVOICE'
  | 'QUOTATION'
  | 'SALES_ORDER'
  | 'SALES_RETURN'
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_ORDER'
  | 'PURCHASE_RETURN'
  | 'PAYMENT_RECEIPT'
  | 'PAYMENT_VOUCHER'
  | 'POS_RECEIPT'
  | 'CUSTOMER_STATEMENT'
  | 'SUPPLIER_STATEMENT'
  | 'JOURNAL_ENTRY';

const TYPE_LABEL_KEY: Record<IssuableDocumentType, string> = {
  SALES_INVOICE: 'documents.type.SALES_INVOICE',
  QUOTATION: 'documents.type.QUOTATION',
  SALES_ORDER: 'documents.type.SALES_ORDER',
  SALES_RETURN: 'documents.type.SALES_RETURN',
  PURCHASE_INVOICE: 'documents.type.PURCHASE_INVOICE',
  PURCHASE_ORDER: 'documents.type.PURCHASE_ORDER',
  PURCHASE_RETURN: 'documents.type.PURCHASE_RETURN',
  PAYMENT_RECEIPT: 'documents.type.PAYMENT_RECEIPT',
  PAYMENT_VOUCHER: 'documents.type.PAYMENT_VOUCHER',
  POS_RECEIPT: 'documents.type.POS_RECEIPT',
  CUSTOMER_STATEMENT: 'documents.type.CUSTOMER_STATEMENT',
  SUPPLIER_STATEMENT: 'documents.type.SUPPLIER_STATEMENT',
  JOURNAL_ENTRY: 'documents.type.JOURNAL_ENTRY',
};

export interface DocumentActionsProps {
  sourceType: DocumentSourceType;
  sourceId: string;
  /** The type issued from this record. */
  type: IssuableDocumentType;
  /**
   * The permissions the documents read route accepts. The cell renders only
   * when the operator holds one of them, matching `RequireAnyPermission` on
   * `GET /documents` rather than hiding behind a narrower single check.
   */
  permissions: string[];
}

/**
 * The attachment entity an attachment row hangs off, or null when the record
 * kind has no attachment support. Only the invoice and the receipt carry
 * supporting paperwork today; anything else hides the control rather than
 * offering a button the API would reject.
 */
function attachmentEntityFor(sourceType: DocumentSourceType): AttachmentEntityType | null {
  if (sourceType === 'SalesInvoice') return 'SALES_INVOICE';
  if (sourceType === 'Payment') return 'PAYMENT';
  return null;
}

export function DocumentActions({ sourceType, sourceId, type, permissions }: DocumentActionsProps) {
  const { t, locale } = useUi();
  const { canAny } = useAuth();

  const [document, setDocument] = useState<OfficialDocumentDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const canRead = canAny(...permissions);

  // ---- attachments ---------------------------------------------------------
  const attachmentEntity = attachmentEntityFor(sourceType);
  const [attachments, setAttachments] = useState<AttachmentDto[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAttach = canAny('erp.sales.invoice.manage', 'erp.accounting.payment.manage');

  const loadAttachments = useCallback(async () => {
    if (!canRead || !attachmentEntity || !sourceId) return;
    try {
      setAttachments(await api.attachments(attachmentEntity, sourceId));
    } catch {
      // A missing list must not break the document actions beside it.
      setAttachments([]);
    }
  }, [canRead, attachmentEntity, sourceId]);

  useEffect(() => {
    void loadAttachments();
  }, [loadAttachments]);

  const onPickFile = async (file: File | undefined) => {
    if (!file || !attachmentEntity) return;
    setAttachBusy(true);
    setAttachError(null);
    try {
      await api.uploadAttachment(attachmentEntity, sourceId, file);
      setAttachOpen(false);
      await loadAttachments();
    } catch (e) {
      setAttachError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setAttachBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    if (!attachmentEntity) return;
    if (!window.confirm(t('common.confirm'))) return;
    try {
      await api.removeAttachment(attachmentEntity, sourceId, attachmentId);
      await loadAttachments();
    } catch (e) {
      setAttachError(e instanceof ApiError ? e.message : t('common.error'));
    }
  };

  const openAttachment = async (attachmentId: string) => {
    if (!attachmentEntity) return;
    try {
      const url = await api.attachmentBlobUrl(attachmentEntity, sourceId, attachmentId);
      window.open(url, '_blank', 'noopener');
      // The new tab owns the blob now; revoke after a delay so it has loaded.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setAttachError(e instanceof ApiError ? e.message : t('common.error'));
    }
  };

  const load = useCallback(async () => {
    if (!canRead || !sourceId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await api.documentsForSource(sourceType, sourceId);
      // The register returns newest first; the current version is the head of
      // the series for this record.
      setDocument(rows.find((r) => r.type === type) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [canRead, sourceId, sourceType, type, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.issueFinancialDocument(type, sourceId);
      setDocument(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  /** Fetch the stored PDF once and reuse the blob URL for preview/print/download. */
  const ensureBlob = useCallback(async (): Promise<string | null> => {
    if (!document) return null;
    if (preview) return preview;
    const url = await api.officialDocumentBlobUrl(document.id);
    setPreview(url);
    return url;
  }, [document, preview]);

  const openPreview = async () => {
    if (!document) return;
    setPreviewLoading(true);
    setError(null);
    try {
      await ensureBlob();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  // The preview iframe holds the blob; printing the frame prints the stored PDF
  // through the browser's own PDF viewer rather than a re-render.
  const print = async () => {
    try {
      const url = await ensureBlob();
      if (!url) return;
      const frame = frameRef.current;
      if (frame?.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        return;
      }
      // No open preview modal: print the blob in a detached frame so the action
      // still works straight from the row.
      const detached = window.document.createElement('iframe');
      detached.style.position = 'fixed';
      detached.style.width = '0';
      detached.style.height = '0';
      detached.style.border = '0';
      detached.src = url;
      detached.onload = () => {
        detached.contentWindow?.focus();
        detached.contentWindow?.print();
      };
      window.document.body.appendChild(detached);
      window.setTimeout(() => detached.remove(), 60_000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  };

  const download = async () => {
    if (!document) return;
    try {
      const url = await ensureBlob();
      if (!url) return;
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${document.documentNumber}.pdf`;
      a.click();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  };

  if (!canRead) return null;

  return (
    <div className="flex flex-wrap justify-end gap-2" data-testid={`doc-actions-${sourceId}`}>
      {loading ? (
        <span className="oryx-faint text-[12px]">{t('common.loading')}</span>
      ) : document ? (
        <>
          <Button
            size="sm"
            variant="primary"
            disabled={previewLoading || !document.downloadable}
            onClick={() => void openPreview()}
            data-testid={`doc-preview-${sourceId}`}
            title={!document.downloadable ? t('documents.notPrintable') : t('documents.preview')}
          >
            <Icon name="scroll" size={14} />
            {t('documents.preview')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!document.downloadable}
            onClick={() => void print()}
            data-testid={`doc-row-print-${sourceId}`}
          >
            <Icon name="print" size={14} />
            {t('documents.print')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!document.downloadable}
            onClick={() => void download()}
            data-testid={`doc-row-download-${sourceId}`}
          >
            <Icon name="download" size={14} />
            {t('documents.download')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void issue()}
            disabled={busy}
            data-testid={`doc-reissue-${sourceId}`}
            title={t('documents.reissueHint')}
          >
            <Icon name="refresh" size={14} />
            {t('documents.reissue')}
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          onClick={() => void issue()}
          disabled={busy}
          data-testid={`doc-issue-${sourceId}`}
        >
          <Icon name="plus" size={14} />
          {t(TYPE_LABEL_KEY[type])}
        </Button>
      )}
      {attachmentEntity ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setAttachOpen(true)}
          data-testid={`doc-attach-${sourceId}`}
          title={t('documents.attach')}
        >
          <Icon name="paperclip" size={14} />
          {attachments.length > 0 ? `${t('documents.attach')} (${attachments.length})` : t('documents.attach')}
        </Button>
      ) : null}
      {error ? <span className="oryx-danger text-[12px]">{error}</span> : null}

      <Modal
        open={preview !== null}
        title={document ? `${t('documents.preview')} — ${document.documentNumber}` : t('documents.preview')}
        onClose={closePreview}
        footer={
          <>
            <Button variant="ghost" onClick={closePreview}>
              {t('common.close')}
            </Button>
            <Button variant="ghost" onClick={download} disabled={!preview} data-testid={`doc-download-${sourceId}`}>
              <Icon name="download" size={14} />
              {t('documents.download')}
            </Button>
            <Button variant="primary" onClick={print} disabled={!preview} data-testid={`doc-print-${sourceId}`}>
              <Icon name="print" size={14} />
              {t('documents.print')}
            </Button>
          </>
        }
      >
        {preview ? (
          <iframe
            ref={frameRef}
            src={preview}
            title={document?.documentNumber ?? 'document'}
            className="oryx-doc-preview"
            data-testid={`doc-frame-${sourceId}`}
          />
        ) : (
          <p className="oryx-faint m-0 text-[12.5px]">{t('common.loading')}</p>
        )}
        {document ? (
          <p className="oryx-faint m-0 mt-2 text-[11.5px]" dir="ltr">
            {document.documentNumber} · v{document.version} · {document.pageCount ?? 0} {t('documents.pages')} ·{' '}
            {new Date(document.issuedAt).toLocaleString(locale)}
          </p>
        ) : null}
      </Modal>

      {attachmentEntity ? (
        <Modal
          open={attachOpen}
          title={t('documents.attachmentsTitle')}
          onClose={() => setAttachOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAttachOpen(false)}>
                {t('common.close')}
              </Button>
              {canAttach ? (
                <Button
                  variant="primary"
                  disabled={attachBusy}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid={`doc-attach-upload-${sourceId}`}
                >
                  <Icon name="paperclip" size={14} />
                  {attachBusy ? t('common.loading') : t('documents.attachFile')}
                </Button>
              ) : null}
            </>
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="hidden"
            data-testid={`doc-attach-input-${sourceId}`}
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <p className="oryx-faint m-0 mb-2 text-[12px]">{t('documents.attachHint')}</p>
          {attachError ? <p className="oryx-danger m-0 mb-2 text-[12px]">{attachError}</p> : null}
          {attachments.length === 0 ? (
            <p className="oryx-faint m-0 text-[12.5px]">{t('documents.noAttachments')}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-[12.5px]"
                  data-testid={`doc-attachment-${a.id}`}
                >
                  <button
                    type="button"
                    className="flex flex-col items-start bg-transparent p-0 text-start"
                    onClick={() => void openAttachment(a.id)}
                    data-testid={`doc-attachment-open-${a.id}`}
                  >
                    <span className="font-semibold">{a.fileName}</span>
                    <span className="oryx-faint text-[11px]" dir="ltr">
                      {(a.mimeType ?? '').replace('application/', '').replace('image/', '')} ·{' '}
                      {Math.max(1, Math.round(a.sizeBytes / 1024))} KB
                    </span>
                  </button>
                  {canAttach ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeAttachment(a.id)}
                      data-testid={`doc-attachment-remove-${a.id}`}
                    >
                      {t('common.delete')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
