'use client';

import { useEffect, useRef, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { Button } from '@/components/ui';

type DetectedBarcode = { rawValue: string };
type NativeBarcodeDetector = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => NativeBarcodeDetector;

/**
 * Camera scanning for POS. Uses the browser's native BarcodeDetector where
 * supported; USB/HID keyboard scanners and manual entry remain available when
 * camera access or barcode decoding is unavailable.
 *
 * The stream and interval are always released on close/unmount.
 */
export function PosCameraScanner({
  open, onClose, onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const { locale } = useUi();
  const ar = locale === 'ar';
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(false);
  const callbackRef = useRef(onDetected);
  useEffect(() => { callbackRef.current = onDetected; }, [onDetected]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let decoding = false;
    detectedRef.current = false;
    const videoElement = videoRef.current;
    const start = async () => {
      try {
        const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
        if (!Detector) throw new Error(ar
          ? 'هذا المتصفح لا يدعم مسح الرموز بالكاميرا. استخدم قارئ الباركود الخارجي أو الإدخال اليدوي.'
          : 'Camera barcode decoding is not supported in this browser. Use a USB scanner or manual entry.');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error(ar
          ? 'الكاميرا غير متاحة. تأكد من استخدام HTTPS والسماح بصلاحية الكاميرا.'
          : 'Camera unavailable. Check HTTPS and camera permission.');
        const detector = new Detector({ formats: [
          'qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e',
        ] });
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
        if (disposed) {
          media.getTracks().forEach(track => track.stop());
          return;
        }
        stream = media;
        const video = videoElement;
        if (!video) return;
        video.srcObject = media;
        await video.play();
        if (disposed) return;
        timer = window.setInterval(() => {
          if (decoding || detectedRef.current || video.readyState < 2) return;
          decoding = true;
          void detector.detect(video).then(results => {
            if (disposed || detectedRef.current) return;
            const value = results.find(x => x.rawValue?.trim())?.rawValue.trim();
            if (value) {
              detectedRef.current = true;
              callbackRef.current(value);
            }
          }).catch(() => {
            // Decoder may reject individual frames. Keep scanning the stream.
          }).finally(() => { decoding = false; });
        }, 180);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
      }
    };
    setError(null);
    void start();
    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, [open, ar]);

  if (!open) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
      data-testid="pos-camera-scanner">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <strong>{ar ? 'مسح باركود أو QR بالكاميرا' : 'Scan barcode / QR using camera'}</strong>
        <Button size="sm" onClick={onClose}>{ar ? 'إغلاق الكاميرا' : 'Close camera'}</Button>
      </div>
      {error ? <p role="alert" className="mb-2 text-sm text-[var(--danger)]">{error}</p> : null}
      <video ref={videoRef} autoPlay playsInline muted
        className="max-h-56 w-full rounded-lg bg-black object-contain"
        aria-label={ar ? 'معاينة الكاميرا' : 'Camera preview'} />
      <p className="mt-2 text-xs text-[var(--muted)]">
        {ar ? 'وجّه الكاميرا نحو الرمز، وسيُضاف المنتج تلقائياً عند التعرف عليه.' :
          'Point the camera at a barcode or QR code to add the recognized product.'}
      </p>
    </div>
  );
}
