'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  | 'PAYMENT_RECEIPT'
  | 'CUSTOMER_STATEMENT'
  | 'SUPPLIER_STATEMENT'
  | 'JOURNAL_ENTRY';

const TYPE_LABEL_KEY: Record<IssuableDocumentType, string> = {
  SALES_INVOICE: 'documents.type.SALES_INVOICE',
  QUOTATION: 'documents.type.QUOTATION',
  SALES_ORDER: 'documents.type.SALES_ORDER',
  SALES_RETURN: 'documents.type.SALES_RETURN',
  PURCHASE_INVOICE: 'documents.type.PURCHASE_INVOICE',
  PAYMENT_RECEIPT: 'documents.type.PAYMENT_RECEIPT',
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

  const openPreview = async () => {
    if (!document) return;
    setPreviewLoading(true);
    setError(null);
    try {
      setPreview(await api.officialDocumentBlobUrl(document.id));
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
  const print = () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  const download = () => {
    if (!preview || !document) return;
    const a = window.document.createElement('a');
    a.href = preview;
    a.download = `${document.documentNumber}.pdf`;
    a.click();
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
          >
            <Icon name="scroll" size={14} />
            {t('documents.preview')}
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
    </div>
  );
}
