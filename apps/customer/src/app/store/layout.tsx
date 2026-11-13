import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'قطع الغيار | Spare parts',
  description:
    'متجر قطع غيار السيارات من أوريكس — ابحث حسب السيارة والماركة والطراز والسنة. ORYX spare-parts store: search by vehicle make, model and year.',
  alternates: { canonical: '/store' },
  openGraph: { url: '/store', images: ['/media/hero-parts.jpg'] },
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
