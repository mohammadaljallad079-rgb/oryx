'use client';

import { useState, type ReactNode } from 'react';
import type { AttachmentEntityType } from '@oryx/shared';
import { useUi } from '@/lib/ui-context';
import { downloadTableCsv, openPrintTable, type PrintTableInput } from '@/lib/print-table';
import { Button, ErrorBanner, Modal, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { AttachmentsPanel } from '@/components/document-print';

/**
 * The one preview a record gets.
 *
 * Every list in the admin app offers an eye button that opens this dialog: the
 * record's own fields, its attachments and the same print/export actions the
 * owning screen uses. Keeping it in one component is what makes the preview
 * look and behave identically in HR, purchasing, sales and operations instead
 * of each screen growing its own half-complete version.
 *
 * The fields are supplied by the caller because only the caller knows the
 * record's shape; the shell, the attachment panel and the toolbar are shared.
 */

export interface RecordPreviewField {
  label: string;
  value: ReactNode;
  /** Span the full width, for notes and long addresses. */
  wide?: boolean;
}

export function RecordPreview({
  open,
  title,
  subtitle,
  fields,
  fieldsLoading = false,
  attachment,
  printInput,
  csvName,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  fields: RecordPreviewField[];
  fieldsLoading?: boolean;
  /** The attachment register that owns this record's paperwork. */
  attachment?: { entityType: AttachmentEntityType; entityId: string; canManage: boolean };
  /** Enables the print and Excel buttons, using the shared report renderer. */
  printInput?: PrintTableInput;
  csvName?: string;
  /** Extra content rendered under the fields, e.g. a line breakdown. */
  children?: ReactNode;
  onClose: () => void;
}) {
  const { t } = useUi();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => void | Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      size="full"
      title={title}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <div className="flex flex-col gap-4" data-testid="record-preview">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>{subtitle ? <p className="oryx-muted m-0 text-[12.5px]">{subtitle}</p> : null}</div>
          {printInput ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run(() => openPrintTable(printInput, true))}
                data-testid="record-preview-print"
              >
                <Icon name="print" size={14} />
                {t('print.print')}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run(() => downloadTableCsv(printInput, csvName ?? 'record'))}
                data-testid="record-preview-csv"
              >
                <Icon name="download" size={14} />
                Excel (CSV)
              </Button>
            </div>
          ) : null}
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        {fieldsLoading ? (
          <Skeleton height={160} />
        ) : (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="record-preview-fields">
            {fields.map((field) => (
              <div
                key={field.label}
                className={`border-b border-[var(--border)] pb-2${field.wide ? ' sm:col-span-2 lg:col-span-3' : ''}`}
              >
                <dt className="oryx-muted text-xs">{field.label}</dt>
                <dd className="mt-0.5 text-[13px] font-semibold">{field.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {children}

        {attachment ? (
          <div className="border-t border-[var(--border)] pt-3">
            <AttachmentsPanel
              entityType={attachment.entityType}
              entityId={attachment.entityId}
              canManage={attachment.canManage}
              categorised
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
