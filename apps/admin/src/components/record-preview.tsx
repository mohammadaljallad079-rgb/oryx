'use client';

import { useState, type ReactNode } from 'react';
import type { AttachmentDto } from '@oryx/shared';
import { useAsync } from '@/lib/hooks';
import { useUi } from '@/lib/ui-context';
import { api } from '@/lib/api';
import { exportCsv, printDocument, type PrintSection } from '@/lib/print';
import { AttachmentField } from './attachments';
import { Icon } from './icons';
import { Button, Card, ErrorBanner, Modal, Skeleton } from './ui';

/**
 * The one record preview used by every section.
 *
 * A preview shows a record's details, its attachments and its actions (print,
 * export) in one surface, so a user never has to open a separate attachments
 * screen to see what is on file. Sections supply the fields; the attachment
 * list, the print layout and the permission handling are shared.
 */

export interface PreviewField {
  label: string;
  value: ReactNode;
  /** Plain text for print and CSV; falls back to `value` when it is a string. */
  text?: string;
}

export interface RecordPreviewProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Attachment catalogue key, e.g. 'WORK_ORDER'. Omit to hide attachments. */
  entityType?: string;
  entityId: string | null;
  fields: PreviewField[];
  /** Extra content under the fields, e.g. a checklist or line items. */
  children?: ReactNode;
  /** Rows for the print/CSV table, with their headers. */
  table?: { headers: string[]; rows: string[][] };
  canWriteAttachments?: boolean;
  canMarkConfidential?: boolean;
  testId?: string;
}

export function RecordPreview({
  open,
  onClose,
  title,
  subtitle,
  entityType,
  entityId,
  fields,
  children,
  table,
  canWriteAttachments = false,
  canMarkConfidential = false,
  testId = 'record-preview',
}: RecordPreviewProps) {
  const { t, locale } = useUi();
  const [attachmentOverrides, setAttachmentOverrides] = useState<AttachmentDto[] | null>(null);
  const attachments = useAsync(
    () => (entityType && entityId ? api.attachments(entityType, entityId) : Promise.resolve({ items: [], total: 0 })),
    [entityType, entityId],
  );
  const items = attachmentOverrides ?? attachments.data?.items ?? [];

  if (!open) return null;

  const printTable =
    table && table.rows.length > 0
      ? {
          table: {
            columns: table.headers.map((header) => ({
              header,
              value: (row: Record<string, unknown>) => String(row[header] ?? ''),
            })),
            rows: table.rows.map((row) =>
              Object.fromEntries(table.headers.map((header, index) => [header, row[index] ?? ''])),
            ),
          },
        }
      : {};

  const sections: PrintSection[] = [
    {
      heading: t('preview.details'),
      fields: fields.map((f) => ({ label: f.label, value: f.text ?? (typeof f.value === 'string' ? f.value : '') })),
      ...printTable,
    },
  ];

  const print = () => {
    const ok = printDocument({
      title,
      subtitle,
      locale,
      sections,
      footer: new Date().toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB'),
    });
    if (!ok) window.alert(t('preview.popupBlocked'));
  };

  const exportRows = () => {
    if (!table) return;
    exportCsv(title.replace(/\s+/g, '-').toLowerCase(), table.headers, table.rows);
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          {table ? (
            <Button onClick={exportRows} data-testid={`${testId}-export`}>
              {t('attach.exportCsv')}
            </Button>
          ) : null}
          <Button variant="primary" onClick={print} data-testid={`${testId}-print`}>
            <Icon name="scroll" size={14} />
            {t('attach.print')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid={testId}>
        {subtitle ? <p className="oryx-muted m-0 text-[12.5px]">{subtitle}</p> : null}

        <Card flat className="p-3">
          <p className="oryx-panel-title m-0 mb-2">{t('preview.details')}</p>
          <dl className="m-0 grid gap-x-5 gap-y-2 sm:grid-cols-2">
            {fields.map((f, index) => (
              <div key={`${f.label}-${index}`} className="flex flex-col border-b border-[var(--border)] pb-1">
                <dt className="oryx-faint m-0 text-[11px]">{f.label}</dt>
                <dd className="m-0 text-[12.5px] font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {children}

        {entityType && entityId ? (
          <div>
            <p className="oryx-panel-title m-0 mb-2">{t('preview.attachments')}</p>
            {attachments.error ? (
              <ErrorBanner message={attachments.error} onRetry={attachments.reload} />
            ) : attachments.loading && attachmentOverrides === null ? (
              <Skeleton height={60} />
            ) : (
              <AttachmentField
                entityType={entityType}
                entityId={entityId}
                value={items}
                onChange={setAttachmentOverrides}
                canWrite={canWriteAttachments}
                canMarkConfidential={canMarkConfidential}
                testId={`${testId}-attachments`}
              />
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
