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

/**
 * Applies the stored theme/locale to <html> before the first paint.
 *
 * Without this the server's dark default is painted first and the stored
 * preference is applied only after hydration, so a light-theme user sees a dark
 * flash on every navigation. Running it as a blocking inline script also means
 * `data-theme` is already correct when React hydrates.
 */
const PREFERENCE_BOOTSTRAP = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('oryx.theme');if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);d.style.colorScheme=t;}var l=localStorage.getItem('oryx.locale');if(l==='ar'||l==='en'){d.setAttribute('lang',l);d.setAttribute('data-dir',l==='ar'?'rtl':'ltr');d.dir=l==='ar'?'rtl':'ltr';}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Defaults are applied server-side; the bootstrap script and the client
  // providers then apply the user's persisted preference.
  return (
    <html lang="ar" dir="rtl" data-theme="dark" data-dir="rtl" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCE_BOOTSTRAP }} />
        <UiProvider dictionaries={dictionaries} initialLocale="ar" initialTheme="dark">
          <AuthProvider>{children}</AuthProvider>
        </UiProvider>
      </body>
    </html>
  );
}
