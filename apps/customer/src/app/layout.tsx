import type { Metadata, Viewport } from 'next';
import './globals.css';
import { dictionaries } from '@/i18n/dictionaries';
import { UiProvider } from '@/lib/ui-context';
import { CustomerAuthProvider } from '@/lib/auth-context';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { JsonLd } from '@/components/json-ld';
import { SITE_URL, organizationJsonLd, websiteJsonLd } from '@/lib/structured-data';

export const metadata: Metadata = {
  // Absolute base so a relative canonical or Open Graph image resolves against
  // the real origin rather than the build host.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'ORYX — Automotive Services',
    template: '%s | ORYX',
  },
  description:
    'ORYX automotive customer platform: book inspections and maintenance at ORYX service centres, track your garage and pay securely.',
  applicationName: 'ORYX',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'ORYX Auto Services',
    title: 'ORYX — Automotive Services',
    description:
      'Book inspections and maintenance at ORYX service centres, track your garage and shop genuine spare parts.',
    url: SITE_URL,
    locale: 'ar_BH',
    alternateLocale: ['en_US'],
    images: [{ url: '/media/auto-service.jpg', width: 1600, height: 1067, alt: 'ORYX Auto Services' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ORYX — Automotive Services',
    description: 'Book inspections and maintenance at ORYX service centres and shop spare parts.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f7f4ed',
};

/**
 * Applies the stored theme/locale to <html> before the first paint.
 *
 * Without this the server's light default is painted first and the stored
 * preference is applied only after hydration, so a dark-theme visitor sees a
 * light flash on every navigation. Running it as a blocking inline script also
 * means `data-theme` is already correct when React hydrates.
 */
const PREFERENCE_BOOTSTRAP = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('oryx.customer.theme');if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);d.style.colorScheme=t;}var l=localStorage.getItem('oryx.customer.locale');if(l==='ar'||l==='en'){d.setAttribute('lang',l);d.setAttribute('data-dir',l==='ar'?'rtl':'ltr');d.dir=l==='ar'?'rtl':'ltr';}}catch(e){}})();`;

/**
 * The site is rendered Arabic RTL light by default — the approved homepage
 * reference is the light theme — and the bootstrap script then applies the
 * visitor's stored preference. The dark theme is the same layout with
 * coordinated navy, blue and gold tokens, so only `data-theme` changes.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="light" data-dir="rtl" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCE_BOOTSTRAP }} />
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
        <UiProvider dictionaries={dictionaries} initialLocale="ar" initialTheme="light">
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
