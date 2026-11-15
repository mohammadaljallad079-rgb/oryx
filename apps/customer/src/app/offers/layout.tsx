import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'العروض | Offers',
  description:
    'عروض وخصومات أوريكس على خدمات السيارات وقطع الغيار. ORYX offers and discounts on automotive services and spare parts.',
  alternates: { canonical: '/offers' },
  openGraph: { url: '/offers', images: ['/media/cat-brakes.jpg'] },
};

export default function OffersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
