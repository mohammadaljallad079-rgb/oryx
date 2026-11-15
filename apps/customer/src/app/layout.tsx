import type { Metadata, Viewport } from 'next';
import './globals.css';
import { dictionaries } from '@/i18n/dictionaries';
import { UiProvider } from '@/lib/ui-context';
import { CustomerAuthProvider } from '@/lib/auth-context';
import { CartProvider } from '@/lib/cart-context';
import { WishlistProvider } from '@/lib/wishlist';
import { SiteContentProvider } from '@/lib/site-content-context';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { WhatsAppFab } from '@/components/whatsapp';
import { JsonLd } from '@/components/json-ld';
import { SITE_URL, organizationJsonLd, websiteJsonLd } from '@/lib/structured-data';

export const metadata: Metadata = {
  // Absolute base so a relative canonical or Open Graph image resolves against
  // the real origin rather than the build host.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'أوريكس لخدمات السيارات | ORYX Auto Services',
    template: '%s | ORYX Auto Services',
  },
  description:
    'أوريكس لخدمات السيارات — صيانة وإصلاح وفحص السيارات وقطع غيار معتمدة في البحرين، مع حجز مواعيد إلكتروني ومتجر قطع غيار. ORYX Auto Services: maintenance, repair, inspection and spare parts in Bahrain.',
  keywords: [
    'ORYX',
    'أوريكس',
    'صيانة سيارات',
    'قطع غيار',
    'البحرين',
    'car service Bahrain',
    'auto spare parts',
  ],
  applicationName: 'ORYX Auto Services',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'ORYX Auto Services',
    title: 'أوريكس لخدمات السيارات | ORYX Auto Services',
    description: 'صيانة وإصلاح وفحص السيارات وقطع غيار معتمدة في البحرين مع حجز إلكتروني.',
    locale: 'ar_BH',
    alternateLocale: 'en_US',
    url: SITE_URL,
    images: [{ url: '/media/hero-services.jpg', width: 1600, height: 1067, alt: 'ORYX Auto Services' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ORYX Auto Services',
    description: 'Maintenance, repair, inspection and approved spare parts in Bahrain.',
    images: ['/media/hero-services.jpg'],
  },
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.png', apple: '/brand/oryx-monogram.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#00162b',
};

/**
 * Applies the stored theme/locale to <html> before the first paint.
 *
 * Without this the server default is painted first and the stored preference is
 * applied only after hydration, so a visitor with the other theme sees a flash
 * on every navigation. Running it as a blocking inline script also means
 * `data-theme` is already correct when React hydrates.
 */
const PREFERENCE_BOOTSTRAP = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('oryx.customer.theme');if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);d.style.colorScheme=t;}var l=localStorage.getItem('oryx.customer.locale');if(l==='ar'||l==='en'){d.setAttribute('lang',l);d.setAttribute('data-dir',l==='ar'?'rtl':'ltr');d.dir=l==='ar'?'rtl':'ltr';}}catch(e){}})();`;

/**
 * The site is rendered Arabic RTL dark by default — the approved identity — and
 * the bootstrap script then applies the visitor's stored preference. The light
 * theme is the same layout with ivory surfaces and navy headings, so only
 * `data-theme` changes.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" data-dir="rtl" suppressHydrationWarning>
      <head>
        {/* Warm the two Tajawal files the first paint needs. */}
        <link
          rel="preload"
          href="/fonts/tajawal/tajawal-arabic-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/tajawal/tajawal-latin-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCE_BOOTSTRAP }} />
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
        <UiProvider dictionaries={dictionaries} initialLocale="ar" initialTheme="dark">
          <SiteContentProvider>
            <CartProvider>
              <CustomerAuthProvider>
                <WishlistProvider>
                  <a href="#main" className="oryx-skip">
                    تخطَّ إلى المحتوى
                  </a>
                  <div className="oryx-page">
                    <SiteHeader />
                    <main className="oryx-main" id="main">
                      {children}
                    </main>
                    <SiteFooter />
                    <WhatsAppFab />
                  </div>
                </WishlistProvider>
              </CustomerAuthProvider>
            </CartProvider>
          </SiteContentProvider>
        </UiProvider>
      </body>
    </html>
  );
}
