import type { Metadata, Viewport } from 'next';
import './globals.css';
import { dictionaries } from '@/i18n/dictionaries';
import { UiProvider } from '@/lib/ui-context';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: 'ORYX — Enterprise Resource Platform',
  description:
    'ORYX Holding ERP, Business SaaS ERP and Automotive Ecosystem control platform. Execution 01: Super Admin foundation.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#00162b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Defaults are applied server-side; the client providers hydrate the user's
  // persisted theme and locale preference immediately afterwards.
  return (
    <html lang="ar" dir="rtl" data-theme="dark" data-dir="rtl" suppressHydrationWarning>
      <body>
        <UiProvider dictionaries={dictionaries} initialLocale="ar" initialTheme="dark">
          <AuthProvider>{children}</AuthProvider>
        </UiProvider>
      </body>
    </html>
  );
}
