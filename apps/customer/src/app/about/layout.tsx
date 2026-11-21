import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/structured-data';

export const metadata: Metadata = {
  title: 'About',
  description:
    'ORYX Auto Services: automotive inspections, maintenance and repair with genuine spare parts in Bahrain. Learn about our workshops and service centres.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About ORYX',
    description: 'Automotive inspections, maintenance and repair with genuine spare parts in Bahrain.',
    url: `${SITE_URL}/about`,
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
