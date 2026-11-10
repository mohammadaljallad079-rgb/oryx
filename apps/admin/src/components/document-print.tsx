'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { renderPrintDocument } from '@/lib/print-document';
import { Icon } from '@/components/icons';
import { Button, ErrorBanner, Modal, Skeleton } from '@/components/ui';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME_TYPES, type AttachmentDto, type PrintDocumentKind } from '@oryx/shared';

/** A small print toolbar injected into the preview window. */
const TOOLBAR = `
<div class="oryx-print-toolbar" style="position:fixed;top:0;left:0;right:0;z-index:10;display:flex;gap:8px;
  justify-content:flex-end;padding:8px 14px;background:#00162b;color:#fff;font:600 12px 'Segoe UI',Arial,sans-serif">
  <button type="button" onclick="window.print()" style="cursor:pointer;border:0;border-radius:6px;padding:6px 14px;
    background:#d4af37;color:#00162b;font-weight:700">Print / طباعة</button>
</div>
<style>@media screen { body { padding-top: 44px; } }
  @media print { .oryx-print-toolbar { display:none !important; } body { padding-top: 0 !important; } }</style>
`;

/**
 * Open the browser's own print pipeline on a rendered document.
 *
 * The document is written into a same-origin blank window rather than a data
 * URL, so the print dialog and "Save as PDF" both work and the tenant's fonts
 * and direction apply. Returns false when the popup was blocked so the caller
 * can tell the user.
 */
function openDocumentWindow(html: string, autoPrint: boolean): boolean {
  const win = window.open('', '_blank', 'width=920,height=1040');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  if (autoPrint) {
    win.focus();
    win.setTimeout(() => win.print(), 350);
  }
  return true;
}

export function DocumentPrintActions({
  kind,
  id,
  compact,
}: {
  kind: PrintDocumentKind;
  id: string;
  compact?: boolean;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState<null | 'preview' | 'print'>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (mode: 'preview' | 'print') => {
      setBusy(mode);
      setError(null);
      try {
        const doc = await api.printDocument(kind, id);
        const html = renderPrintDocument(doc, locale).replace('</body>', `${TOOLBAR}</body>`);
        const opened = openDocumentWindow(html, mode === 'print');
        if (!opened) setError(t('print.popupBlocked'));
      } catch (e) {
        setError(e instanceof Error ? e.message : t('common.error'));
      } finally {
        setBusy(null);
      }
    },
    [kind, id, locale, t],
  );

  return (
    <>
      <div className="inline-flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => run('preview')}
          disabled={busy !== null}
          data-testid={`preview-${kind.toLowerCase()}-${id}`}
          title={t('print.preview')}
        >
          <Icon name="eye" size={15} />
          {compact ? null : t('print.preview')}
        </Button>
        <Button
          size="sm"
          onClick={() => run('print')}
          disabled={busy !== null}
          data-testid={`print-${kind.toLowerCase()}-${id}`}
          title={t('print.print')}
        >
          <Icon name="print" size={15} />
          {compact ? null : t('print.print')}
        </Button>
      </div>
      {error ? <div className="mt-2"><ErrorBanner message={error} /></div> : null}
    </>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Attachment panel for a single document.
 *
 * Lists the files linked to the document, accepts a PDF/JPG/PNG upload and
 * lets the user preview (inline), download or remove each one. The list is
 * always re-read from the API after a change, so the panel reflects the stored
 * state rather than an optimistic guess.
 */
export function AttachmentsPanel({
  entityType,
  entityId,
  canManage,
}: {
  entityType: 'SALES_INVOICE' | 'PAYMENT';
  entityId: string;
  canManage: boolean;
}) {
  const { t } = useUi();
  const [items, setItems] = useState<AttachmentDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.attachments(entityType, entityId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setItems([]);
    }
  }, [entityType, entityId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Release the object URL when the preview closes or the panel unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError(t('attachments.unsupported'));
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setError(t('attachments.tooLarge'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.uploadAttachment(entityType, entityId, file);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openPreview = async (item: AttachmentDto) => {
    try {
      const blob = await api.fetchAttachmentBlob(entityType, entityId, item.id);
      setPreview({ url: URL.createObjectURL(blob), mime: item.mimeType ?? blob.type, name: item.fileName });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const download = async (item: AttachmentDto) => {
    try {
      const blob = await api.fetchAttachmentBlob(entityType, entityId, item.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      // Detaching the anchor or revoking the object URL in the same task can
      // cancel a download the browser has not committed yet, so both are
      // deferred.
      window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const remove = async (item: AttachmentDto) => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAttachment(entityType, entityId, item.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid={`attachments-${entityId}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="oryx-label m-0 inline-flex items-center gap-1.5">
          <Icon name="paperclip" size={15} />
          {t('attachments.title')}
        </span>
        {canManage ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
              data-testid={`attach-input-${entityId}`}
            />
            <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()} data-testid={`attach-${entityId}`}>
              <Icon name="plus" size={14} />
              {t('attachments.attach')}
            </Button>
          </>
        ) : null}
      </div>
      {error ? <div className="mb-2"><ErrorBanner message={error} /></div> : null}
      {items === null ? (
        <Skeleton height={32} />
      ) : items.length === 0 ? (
        <p className="oryx-faint m-0 text-[12px]">{t('attachments.empty')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5"
              data-testid={`attachment-${item.id}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon name="paperclip" size={14} />
                <span className="truncate text-[12.5px] font-semibold">{item.fileName}</span>
                <span className="oryx-faint shrink-0 text-[11px]">{humanSize(item.sizeBytes)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openPreview(item)}
                  title={t('print.preview')}
                  data-testid={`attachment-preview-${item.id}`}
                >
                  <Icon name="eye" size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => download(item)}
                  title={t('attachments.download')}
                  data-testid={`attachment-download-${item.id}`}
                >
                  <Icon name="download" size={14} />
                </Button>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => remove(item)}
                    title={t('common.delete')}
                    data-testid={`attachment-delete-${item.id}`}
                  >
                    <Icon name="close" size={14} />
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal open={preview !== null} title={preview?.name ?? ''} onClose={() => setPreview(null)}>
        {preview ? (
          preview.mime === 'application/pdf' ? (
            <iframe
              title={preview.name}
              src={preview.url}
              className="h-[70vh] w-full rounded-md border border-[var(--border)]"
              data-testid="attachment-preview-content"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.name}
              className="mx-auto max-h-[70vh] rounded-md"
              data-testid="attachment-preview-content"
            />
          )
        ) : null}
      </Modal>
    </div>
  );
}
