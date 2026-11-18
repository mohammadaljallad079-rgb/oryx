'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { useUi } from '@/lib/ui-context';

/**
 * Share the actual authorized PDF file; never open a text-only WhatsApp/mail
 * composer and call that a PDF share. Browsers without file-sharing support
 * provide an explicit download instead of silently sharing only a message.
 */
export function PdfShareActions({ url, filename }: { url: string; filename: string }) {
  const { locale } = useUi();
  const ar = locale === 'ar';
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function getFile(): Promise<File> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(ar ? 'تعذر تحميل ملف PDF' : 'Could not load PDF');
    return new File([await response.blob()], filename, { type: 'application/pdf' });
  }

  function download(file: File) {
    const href = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 15_000);
  }

  async function handleAction(action: 'share' | 'download') {
    setBusy(true);
    setNotice('');
    try {
      const file = await getFile();
      if (action === 'share') {
        // If the browser supports only text links, do not call navigator.share:
        // doing so silently sends the title but not the actual PDF attachment.
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
        download(file);
        setNotice(ar
          ? 'المتصفح لا يدعم مشاركة ملفات PDF مباشرة. تم تنزيل الملف؛ أرفقه من تطبيق المشاركة.'
          : 'This browser cannot share PDF attachments. The file was downloaded; attach it in your sharing app.');
        return;
      }
      download(file);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setNotice(error instanceof Error ? error.message : (ar ? 'تعذر تجهيز ملف PDF' : 'Could not prepare PDF'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="pdf-share-actions">
      <Button size="sm" disabled={busy} onClick={() => void handleAction('share')} data-testid="pdf-share-native">
        {ar ? 'مشاركة PDF' : 'Share PDF'}
      </Button>
      <Button size="sm" disabled={busy} onClick={() => void handleAction('download')} data-testid="pdf-share-download">
        {ar ? 'تنزيل PDF' : 'Download PDF'}
      </Button>
      {notice ? <p className="m-0 w-full text-xs text-[var(--muted)]" role="status">{notice}</p> : null}
    </div>
  );
}
