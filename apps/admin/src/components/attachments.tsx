'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ATTACHMENT_MAX_BYTES,
  attachmentPreviewKind,
  resolveMimeType,
  type AttachmentDto,
  type AttachmentPreviewKind,
} from '@oryx/shared';
import { api, downloadAttachment, fetchAttachmentBlob } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { Button, Modal } from './ui';
import { Icon } from './icons';

/**
 * The one attachment field used inside every create/edit form.
 *
 * Files are chosen in the form and uploaded when the form saves — not on pick —
 * so a cancelled form leaves nothing behind. To make that possible without
 * needing the record id up front, the field supports a two-phase flow:
 *
 *  1. `entityId` is empty (new record): the picked files are held in component
 *     state and flushed by `flush()` once the parent has an id.
 *  2. `entityId` is known (edit): files are still held until save, and the
 *     parent calls `flush()` in the same submit handler.
 *
 * Existing attachments can be deleted or replaced immediately, because those
 * operations act on a row that already exists.
 */

export interface AttachmentDraft {
  file: File;
  /** Object URL for an image thumbnail; revoked when the draft is dropped. */
  previewUrl: string | null;
  kind: AttachmentPreviewKind;
}

export interface AttachmentFieldHandle {
  /** Upload the pending drafts. Call after the record id is known. */
  flush: (entityId?: string) => Promise<AttachmentDto[]>;
  /** Number of drafts that have not been uploaded yet. */
  pendingCount: () => number;
  /** Drop drafts without uploading (the form was cancelled). */
  discard: () => void;
}

export interface AttachmentFieldProps {
  entityType: string;
  entityId: string | null;
  /** Existing attachments, owned by the parent so a save can refresh them. */
  value: AttachmentDto[];
  onChange: (next: AttachmentDto[]) => void;
  /** Expose the imperative handle to the form. */
  registerFlush?: (handle: AttachmentFieldHandle | null) => void;
  canWrite: boolean;
  /** Allow marking a file confidential (needs the module's confidential right). */
  canMarkConfidential?: boolean;
  /** Show the "set as primary" action (employee photograph, for example). */
  allowPrimary?: boolean;
  /**
   * Upload picked files immediately instead of holding them for a form save.
   *
   * Only for fields that sit outside a form and own an existing record — the
   * employee photograph card. Inside a form this must stay off, or a cancelled
   * form would leave the files behind.
   */
  autoFlush?: boolean;
  label?: string;
  hint?: string;
  /** Tests and labels need a stable hook per entity. */
  testId?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentField({
  entityType,
  entityId,
  value,
  onChange,
  registerFlush,
  canWrite,
  canMarkConfidential = false,
  allowPrimary = false,
  autoFlush = false,
  label,
  hint,
  testId = 'attachment-field',
}: AttachmentFieldProps) {
  const { t, locale } = useUi();
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confidential, setConfidential] = useState(false);
  const [preview, setPreview] = useState<AttachmentDto | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useMemo(
    () =>
      [
        'image/*',
        'application/pdf',
        'text/plain',
        'text/csv',
        '.doc',
        '.docx',
        '.xls',
        '.xlsx',
        '.ppt',
        '.pptx',
        '.odt',
        '.ods',
        '.zip',
        '.json',
        '.xml',
      ].join(','),
    [],
  );

  const addDrafts = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      const next: AttachmentDraft[] = [];
      for (const file of Array.from(files)) {
        if (file.size > ATTACHMENT_MAX_BYTES) {
          setError(t('attach.tooLarge'));
          continue;
        }
        const kind = attachmentPreviewKind(resolveMimeType(file.name, file.type), file.name);
        next.push({
          file,
          kind,
          previewUrl: kind === 'image' ? URL.createObjectURL(file) : null,
        });
      }
      if (next.length > 0) setDrafts((prev) => [...prev, ...next]);
    },
    [t],
  );

  const dropDraft = useCallback((index: number) => {
    setDrafts((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return copy;
    });
  }, []);

  const flush = useCallback(
    async (overrideId?: string) => {
      const target = overrideId ?? entityId;
      if (!target || drafts.length === 0) return [];
      setBusy(true);
      setError(null);
      try {
        const res = await api.uploadAttachments(
          entityType,
          target,
          drafts.map((d) => d.file),
          { isConfidential: confidential },
        );
        for (const draft of drafts) if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
        setDrafts([]);
        onChange([...res.items, ...value]);
        return res.items;
      } catch {
        setError(t('attach.uploadFailed'));
        throw new Error('attachment_upload_failed');
      } finally {
        setBusy(false);
      }
    },
    [confidential, drafts, entityId, entityType, onChange, t, value],
  );

  const discard = useCallback(() => {
    for (const draft of drafts) if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    setDrafts([]);
  }, [drafts]);

  // A field outside a form has no save step, so it uploads as soon as a file is
  // picked. The ref stops the effect firing twice before `drafts` is cleared.
  const flushing = useRef(false);
  useEffect(() => {
    if (!autoFlush || !entityId || drafts.length === 0 || flushing.current) return;
    flushing.current = true;
    void flush()
      // `flush` already surfaced the failure in the field's error line.
      .catch(() => [])
      .finally(() => {
        flushing.current = false;
      });
  }, [autoFlush, entityId, drafts.length, flush]);

  useEffect(() => {
    registerFlush?.({ flush, pendingCount: () => drafts.length, discard });
    return () => registerFlush?.(null);
  }, [discard, drafts.length, flush, registerFlush]);

  // A replaced/deleted row changes the list; the parent owns it.
  const removeExisting = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAttachment(id);
      onChange(value.filter((a) => a.id !== id));
    } catch {
      setError(t('attach.deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const replaceExisting = async (id: string, file: File) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.replaceAttachment(id, file);
      onChange(value.map((a) => (a.id === id ? updated : a)));
    } catch {
      setError(t('attach.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const setPrimary = async (id: string) => {
    setBusy(true);
    try {
      const updated = await api.updateAttachment(id, { isPrimary: true });
      onChange(value.map((a) => (a.isPrimary && a.id !== id ? { ...a, isPrimary: false } : a.id === id ? updated : a)));
    } catch {
      setError(t('attach.updateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const total = value.length + drafts.length;

  return (
    <div className="oryx-attachment-field" data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="oryx-label m-0">
          {label ?? t('attach.title')}
          <span className="oryx-faint ms-2 text-[11px]">({total})</span>
        </span>
        {canWrite ? (
          <div className="flex items-center gap-2">
            {canMarkConfidential ? (
              <label className="flex items-center gap-1.5 text-[11.5px]">
                <input
                  type="checkbox"
                  checked={confidential}
                  onChange={(e) => setConfidential(e.target.checked)}
                  data-testid={`${testId}-confidential`}
                />
                <span className="oryx-muted">{t('attach.confidential')}</span>
              </label>
            ) : null}
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy} data-testid={`${testId}-pick`}>
              <Icon name="plus" size={14} />
              {t('attach.add')}
            </Button>
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        data-testid={`${testId}-input`}
        onChange={(e) => {
          addDrafts(e.target.files);
          // Allow picking the same file again after a removal.
          e.target.value = '';
        }}
      />

      {hint ? <p className="oryx-faint m-0 mb-2 text-[11.5px]">{hint}</p> : null}
      {error ? (
        <p className="m-0 mb-2 text-[12px]" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      ) : null}

      {total === 0 ? (
        <p className="oryx-faint m-0 rounded-lg border border-dashed px-3 py-4 text-center text-[12px]" style={{ borderColor: 'var(--border)' }}>
          {t('attach.empty')}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {value.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: 'var(--border)' }} data-testid={`${testId}-item`}>
              <Icon name={iconFor(item.previewKind)} size={15} />
              <button
                type="button"
                className="min-w-0 flex-1 truncate bg-transparent p-0 text-start text-[12.5px]"
                onClick={() => setPreview(item)}
                title={item.fileName}
              >
                {item.fileName}
              </button>
              {item.isPrimary ? <span className="oryx-badge oryx-badge--gold">{t('attach.primary')}</span> : null}
              {item.isConfidential ? <span className="oryx-badge oryx-badge--warning">{t('attach.confidential')}</span> : null}
              <span className="oryx-faint text-[11px] tabular-nums">{formatBytes(item.sizeBytes)}</span>
              {canWrite && allowPrimary && !item.isPrimary ? (
                <button type="button" className="oryx-btn oryx-btn--ghost oryx-btn--sm" onClick={() => void setPrimary(item.id)} disabled={busy}>
                  {t('attach.setPrimary')}
                </button>
              ) : null}
              {canWrite ? (
                <>
                  <label className="oryx-btn oryx-btn--ghost oryx-btn--sm cursor-pointer">
                    {t('attach.replace')}
                    <input
                      type="file"
                      className="hidden"
                      accept={accept}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void replaceExisting(item.id, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="oryx-btn oryx-btn--ghost oryx-btn--sm"
                    onClick={() => void removeExisting(item.id)}
                    disabled={busy}
                    aria-label={t('common.delete')}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </>
              ) : null}
            </li>
          ))}

          {drafts.map((draft, index) => (
            <li
              key={`${draft.file.name}-${index}`}
              className="flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-1.5"
              style={{ borderColor: 'var(--gold)' }}
              data-testid={`${testId}-draft`}
            >
              {draft.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <Icon name={iconFor(draft.kind)} size={15} />
              )}
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{draft.file.name}</span>
              <span className="oryx-faint text-[11px] tabular-nums">{formatBytes(draft.file.size)}</span>
              <span className="oryx-badge">{t('attach.pending')}</span>
              <button
                type="button"
                className="oryx-btn oryx-btn--ghost oryx-btn--sm"
                onClick={() => dropDraft(index)}
                aria-label={t('common.delete')}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {busy ? <p className="oryx-faint m-0 mt-2 text-[11.5px]">{t('common.loading')}</p> : null}

      <AttachmentPreviewModal
        attachment={preview}
        onClose={() => setPreview(null)}
        canDownload={preview?.canDownload ?? true}
        locale={locale}
      />
    </div>
  );
}

function iconFor(kind: AttachmentPreviewKind): string {
  switch (kind) {
    case 'image':
      return 'globe';
    case 'pdf':
      return 'scroll';
    case 'office':
      return 'package';
    case 'text':
      return 'scroll';
    default:
      return 'package';
  }
}

/**
 * Preview one attachment without downloading it.
 *
 * Images and PDFs render from an object URL obtained with the session headers;
 * office documents cannot be rendered by a browser, so the modal says so and
 * offers the download instead of showing a blank frame.
 */
export function AttachmentPreviewModal({
  attachment,
  onClose,
  canDownload,
  locale,
}: {
  attachment: AttachmentDto | null;
  onClose: () => void;
  canDownload: boolean;
  locale: 'ar' | 'en';
}) {
  const { t } = useUi();
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(null);
    setText(null);
    setFailed(false);
    if (!attachment) return;
    let revoked: string | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        const blob = await fetchAttachmentBlob(attachment.id);
        if (cancelled) return;
        if (attachment.previewKind === 'text') {
          setText(await blob.text());
          return;
        }
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [attachment]);

  if (!attachment) return null;

  return (
    <Modal open title={attachment.fileName} onClose={onClose} footer={
      <>
        <Button onClick={onClose}>{t('common.close')}</Button>
        {canDownload ? (
          <Button
            variant="primary"
            onClick={() => void downloadAttachment(attachment.id, attachment.fileName)}
            data-testid="attachment-preview-download"
          >
            {t('attach.download')}
          </Button>
        ) : null}
      </>
    }>
      <div className="flex flex-col gap-3" data-testid="attachment-preview">
        {failed ? (
          <p className="oryx-muted m-0 text-[13px]">{t('attach.previewUnavailable')}</p>
        ) : attachment.previewKind === 'image' ? (
          url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={attachment.fileName} className="mx-auto max-h-[60vh] rounded-lg object-contain" />
          ) : (
            <p className="oryx-faint m-0 text-[12.5px]">{t('common.loading')}</p>
          )
        ) : attachment.previewKind === 'pdf' ? (
          url ? (
            <iframe src={url} title={attachment.fileName} className="h-[62vh] w-full rounded-lg border" style={{ borderColor: 'var(--border)' }} />
          ) : (
            <p className="oryx-faint m-0 text-[12.5px]">{t('common.loading')}</p>
          )
        ) : attachment.previewKind === 'text' ? (
          <pre className="max-h-[60vh] overflow-auto rounded-lg border p-3 text-[12px]" style={{ borderColor: 'var(--border)' }}>
            {text ?? t('common.loading')}
          </pre>
        ) : (
          <div className="rounded-lg border px-4 py-6 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="m-0 text-[13px] font-semibold">{t('attach.noInlinePreview')}</p>
            <p className="oryx-muted m-0 mt-1 text-[12px]">{t('attach.noInlinePreviewHint')}</p>
          </div>
        )}
        <dl className="m-0 grid grid-cols-2 gap-2 text-[12px]">
          <div>
            <dt className="oryx-faint m-0">{t('attach.type')}</dt>
            <dd className="m-0 font-semibold">{attachment.mimeType}</dd>
          </div>
          <div>
            <dt className="oryx-faint m-0">{t('attach.size')}</dt>
            <dd className="m-0 font-semibold tabular-nums">{formatBytes(attachment.sizeBytes)}</dd>
          </div>
          <div>
            <dt className="oryx-faint m-0">{t('attach.uploadedAt')}</dt>
            <dd className="m-0 font-semibold">{new Date(attachment.createdAt).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB')}</dd>
          </div>
        </dl>
      </div>
    </Modal>
  );
}
