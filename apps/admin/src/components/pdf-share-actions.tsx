'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { useUi } from '@/lib/ui-context';

/**
 * Shares the already-authorised PDF blob rather than exposing an unprotected
 * document URL. Web Share supports file attachments on compatible devices;
 * browsers without it download the PDF for manual attachment.
 */
export function PdfShareActions({ url, filename }: { url: string; filename: string }) {
  const { locale } = useUi();
  const ar = locale === 'ar';
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadFile = async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(ar ? 'تعذر تحميل ملف PDF' : 'Could not load PDF');
    return new File([await response.blob()], filename, { type: 'application/pdf' });
  };

  const download = (file: File) => {
    const href = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 15000);
  };

  async function share(kind: 'native' | 'whatsapp' | 'email' | 'download') {
    setBusy(true);
    setNotice('');
    try {
      // Reserve the external composer in the actual click gesture.
      const popup = kind === 'whatsapp' || kind === 'email'
        ? window.open('about:blank', '_blank') : null;
      const file = await loadFile();
      if (kind === 'native' && navigator.share &&
          (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
      download(file);
      if (kind === 'whatsapp') {
        const msg = ar ? 'ملف PDF جاهز للمشاركة. يرجى إرفاق الملف الذي تم تنزيله.' :
          'The PDF was downloaded. Please attach it in WhatsApp.';
        if (popup) popup.location.href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
      } else if (kind === 'email') {
        const subject = encodeURIComponent(filename);
        const body = encodeURIComponent(ar
          ? 'يرجى إرفاق ملف PDF الذي تم تنزيله من ORYX قبل إرسال الرسالة.'
          : 'Please attach the PDF downloaded from ORYX before sending.');
        if (popup) popup.location.href = `mailto:?subject=${subject}&body=${body}`;
      }
      if (kind !== 'download') setNotice(ar
        ? 'تم تنزيل PDF. أرفق الملف في التطبيق المطلوب؛ لا يتم إرساله تلقائيًا من المتصفح.'
        : 'PDF downloaded. Attach it in the chosen app; the browser cannot attach it automatically.');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setNotice(error instanceof Error ? error.message : (ar ? 'تعذرت المشاركة' : 'Share failed'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="pdf-share-actions">
      <Button size="sm" disabled={busy} onClick={() => void share('native')} data-testid="pdf-share-native">
        {ar ? 'مشاركة PDF' : 'Share PDF'}
      </Button>
      <Button size="sm" disabled={busy} onClick={() => void share('whatsapp')} data-testid="pdf-share-whatsapp">
        {ar ? 'واتساب' : 'WhatsApp'}
      </Button>
      <Button size="sm" disabled={busy} onClick={() => void share('email')} data-testid="pdf-share-email">
        {ar ? 'البريد الإلكتروني' : 'Email'}
      </Button>
      <Button size="sm" disabled={busy} onClick={() => void share('download')} data-testid="pdf-share-download">
        {ar ? 'تنزيل' : 'Download'}
      </Button>
      {notice ? <p className="m-0 w-full text-xs text-[var(--muted)]" role="status">{notice}</p> : null}
    </div>
  );
}
