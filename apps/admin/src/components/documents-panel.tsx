'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import { Button, Card, EmptyState, ErrorBanner, Field, Modal, Skeleton, TableShell } from '@/components/ui';
import { ALLOWED_DOCUMENT_EXTENSIONS, type DocumentDto } from '@oryx/shared';

const CATEGORIES = ['general', 'contract', 'identity', 'certificate', 'invoice', 'photo', 'cv'] as const;

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * The unified document panel.
 *
 * One component attaches documents to any record: it is told the record's
 * `entityType`/`entityId` and reads and writes through the shared documents API,
 * so every module gets the same upload, list, delete and permission behaviour
 * and a document is always linked to the row it belongs to.
 */
export function DocumentsPanel({
  entityType,
  entityId,
  canUpload,
  canDelete,
  title,
}: {
  entityType: string;
  entityId: string;
  canUpload: boolean;
  canDelete: boolean;
  title?: string;
}) {
  const { t } = useUi();
  const list = useAsync(() => api.documents({ entityType, entityId }), [entityType, entityId]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('general');
  const [preview, setPreview] = useState<DocumentDto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('entityType', entityType);
      form.append('entityId', entityId);
      form.append('category', category);
      await api.uploadDocument(form);
      await list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const replace = async (file: File) => {
    const target = replaceTargetRef.current;
    if (!target) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.replaceDocument(target, form);
      await list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setUploading(false);
      replaceTargetRef.current = null;
      if (replaceRef.current) replaceRef.current.value = '';
    }
  };

  /** Load the bytes for the preview modal and release the previous blob URL. */
  const openPreview = async (doc: DocumentDto) => {
    setPreview(doc);
    setPreviewBusy(true);
    setError(null);
    try {
      const { blob } = await api.downloadDocument(doc.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setPreviewUrl(null);
    } finally {
      setPreviewBusy(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreview(null);
  };

  const download = async (doc: DocumentDto) => {
    setError(null);
    try {
      const { blob, fileName } = await api.downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const remove = async (doc: DocumentDto) => {
    if (!window.confirm(t('documents.confirmDelete'))) return;
    setError(null);
    try {
      await api.deleteDocument(doc.id);
      await list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  return (
    <Card className="p-4" data-testid={`documents-${entityType.toLowerCase()}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="oryx-panel-title m-0">{title ?? t('documents.title')}</p>
        {canUpload ? (
          <div className="flex flex-wrap items-center gap-2">
            <select className="oryx-select oryx-select--sm" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="document-category">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`documents.category.${c}`)}
                </option>
              ))}
            </select>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={ALLOWED_DOCUMENT_EXTENSIONS.join(',')}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
              data-testid="document-file-input"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              data-testid="document-upload"
            >
              <Icon name="plus" size={15} />
              {uploading ? t('documents.uploading') : t('documents.upload')}
            </Button>
          </div>
        ) : null}
      </div>
      <p className="oryx-faint m-0 mb-3 text-[11.5px]">{t('documents.allowed')}</p>

      {error ? <div className="mb-3"><ErrorBanner message={error} /></div> : null}
      {list.error ? <div className="mb-3"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}

      {list.loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} height={30} />
          ))}
        </div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('documents.empty')} hint={t('documents.emptyHint')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('documents.fileName')}</th>
              <th>{t('documents.category')}</th>
              <th>{t('documents.size')}</th>
              <th>{t('documents.uploadedAt')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((doc) => (
              <tr key={doc.id} data-testid={`document-row-${doc.id}`}>
                <td>
                  <span className="block font-semibold">{doc.title ?? doc.fileName}</span>
                  <span className="oryx-faint block text-[11px]">{doc.mimeType ?? '—'}</span>
                </td>
                <td className="text-[12.5px]">{doc.category ? t(`documents.category.${doc.category}`) : '—'}</td>
                <td className="tabular-nums text-[12.5px]">{formatSize(doc.sizeBytes)}</td>
                <td className="text-[12.5px]">{doc.createdAt.slice(0, 10)}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" onClick={() => void openPreview(doc)} data-testid={`document-preview-${doc.id}`}>
                      {t('documents.preview')}
                    </Button>
                    <Button size="sm" onClick={() => void download(doc)} data-testid={`document-download-${doc.id}`}>
                      {t('documents.download')}
                    </Button>
                    {canUpload ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          replaceTargetRef.current = doc.id;
                          replaceRef.current?.click();
                        }}
                        data-testid={`document-replace-${doc.id}`}
                      >
                        {t('documents.replace')}
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button size="sm" variant="danger" onClick={() => void remove(doc)} data-testid={`document-delete-${doc.id}`}>
                        {t('documents.delete')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <input
        ref={replaceRef}
        type="file"
        className="hidden"
        accept={ALLOWED_DOCUMENT_EXTENSIONS.join(',')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void replace(file);
        }}
        data-testid="document-replace-input"
      />

      <Modal open={!!preview} title={preview?.title ?? preview?.fileName ?? ''} onClose={closePreview} wide>
        <div className="flex flex-col gap-3 text-[13px]">
          {error ? <ErrorBanner message={error} /> : null}
          {previewBusy ? (
            <Skeleton height={240} />
          ) : previewUrl ? (
            preview?.mimeType?.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={preview?.fileName ?? ''}
                className="max-h-[60vh] w-full rounded-xl border object-contain"
                style={{ borderColor: 'var(--border)' }}
                data-testid="document-preview-image"
              />
            ) : preview?.mimeType === 'application/pdf' ? (
              <iframe
                src={previewUrl}
                title={preview?.fileName ?? ''}
                className="h-[60vh] w-full rounded-xl border"
                style={{ borderColor: 'var(--border)' }}
                data-testid="document-preview-frame"
              />
            ) : (
              <p className="oryx-muted m-0 text-[12px]">{t('documents.noPreview')}</p>
            )
          ) : (
            <p className="oryx-muted m-0 text-[12px]">{t('documents.noPreview')}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('documents.fileName')}>
              <input className="oryx-input" value={preview?.fileName ?? ''} readOnly />
            </Field>
            <Field label={t('documents.type')}>
              <input className="oryx-input" value={preview?.mimeType ?? '—'} readOnly />
            </Field>
            <Field label={t('documents.size')}>
              <input className="oryx-input" value={formatSize(preview?.sizeBytes ?? 0)} readOnly />
            </Field>
            <Field label={t('documents.uploadedAt')}>
              <input className="oryx-input" value={preview?.createdAt.slice(0, 19).replace('T', ' ') ?? ''} readOnly />
            </Field>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={closePreview}>{t('common.close')}</Button>
            {preview ? (
              <Button variant="primary" onClick={() => void download(preview)} data-testid="document-preview-download">
                {t('documents.download')}
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </Card>
  );
}
