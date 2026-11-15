import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'احجز موعدًا | Book an appointment',
  description:
    'احجز موعد صيانة أو فحص سيارتك في أوريكس — اختر الخدمة والفرع والوقت المناسب. Book a maintenance or inspection appointment at ORYX.',
  alternates: { canonical: '/booking' },
  openGraph: { url: '/booking', images: ['/media/hero-maintenance.jpg'] },
};

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
