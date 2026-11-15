'use client';

import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { renderPrintDocument } from '@/lib/print-document';
import { Icon } from '@/components/icons';
import { Button, ErrorBanner } from '@/components/ui';
import type { PrintDocumentKind } from '@oryx/shared';

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

/**
 * Preview and print the approved ORYX form for an issued document.
 *
 * The model comes from the API (built from the document's own persisted rows)
 * and is rendered by the shared print template, so the printed page matches the
 * approved reference form and the tenant's own letterhead. Nothing is printed
 * from client state.
 */
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
      {error ? (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      ) : null}
    </>
  );
}
