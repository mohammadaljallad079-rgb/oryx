import type { Metadata, Viewport } from 'next';
import './globals.css';
import { dictionaries } from '@/i18n/dictionaries';
import { UiProvider } from '@/lib/ui-context';
import { CustomerAuthProvider } from '@/lib/auth-context';
import { CartProvider } from '@/lib/cart-context';
import { WishlistProvider } from '@/lib/wishlist';
import { SiteContentProvider } from '@/lib/site-content-context';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { SITE_URL } from '@/lib/structured-data';

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
  openGraph: {
    type: 'website',
    siteName: 'ORYX Auto Services',
    title: 'أوريكس لخدمات السيارات | ORYX Auto Services',
    description: 'صيانة وإصلاح وفحص السيارات وقطع غيار معتمدة في البحرين مع حجز إلكتروني.',
    locale: 'ar_BH',
    alternateLocale: 'en_US',
    url: siteUrl,
    images: ['/media/hero-services.jpg'],
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
 * The site is rendered Arabic RTL dark by default — the approved identity — and
 * the client providers apply the visitor's stored preference immediately after
 * hydration.
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
