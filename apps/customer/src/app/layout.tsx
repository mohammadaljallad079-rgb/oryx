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
 * Applies the stored theme/locale to <html> before the first paint.
 *
 * Without this the server's dark default is painted first and the stored
 * preference is applied only after hydration, so a light-theme visitor sees a
 * dark flash on every navigation. Running it as a blocking inline script also
 * means `data-theme` is already correct when React hydrates.
 */
const PREFERENCE_BOOTSTRAP = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('oryx.customer.theme');if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);d.style.colorScheme=t;}var l=localStorage.getItem('oryx.customer.locale');if(l==='ar'||l==='en'){d.setAttribute('lang',l);d.setAttribute('data-dir',l==='ar'?'rtl':'ltr');d.dir=l==='ar'?'rtl':'ltr';}}catch(e){}})();`;

/**
 * The site is rendered Arabic RTL dark by default — the approved identity — and
 * the bootstrap script then applies the visitor's stored preference.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" data-dir="rtl" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCE_BOOTSTRAP }} />
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
