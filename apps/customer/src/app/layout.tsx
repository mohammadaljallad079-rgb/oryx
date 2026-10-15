import type { Metadata, Viewport } from 'next';
import './globals.css';
import { dictionaries } from '@/i18n/dictionaries';
import { UiProvider } from '@/lib/ui-context';
import { CustomerAuthProvider } from '@/lib/auth-context';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';

export const metadata: Metadata = {
  title: 'ORYX — Automotive Services',
  description:
    'ORYX automotive customer platform: book inspections and maintenance, track your garage and pay securely with trusted Bahrain providers.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#00162b',
};

/**
 * The site is rendered Arabic RTL dark by default — the approved identity — and
 * the client providers apply the visitor's stored preference immediately after
 * hydration.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" data-dir="rtl" suppressHydrationWarning>
      <body>
        <UiProvider dictionaries={dictionaries} initialLocale="ar" initialTheme="dark">
          <CustomerAuthProvider>
            <div className="oryx-page">
              <SiteHeader />
              <main className="oryx-main" id="main">
                {children}
              </main>
              <SiteFooter />
            </div>
          </CustomerAuthProvider>
        </UiProvider>
      </body>
    </html>
  );
}
