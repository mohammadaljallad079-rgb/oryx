import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/structured-data';

export const metadata: Metadata = {
  title: 'Categories',
  description:
    'Browse ORYX automotive service and spare-part categories: engine parts, filters, oils, brakes, tyres, batteries, electrical, suspension and more.',
  alternates: { canonical: '/categories' },
  openGraph: {
    title: 'Categories | ORYX',
    description: 'Browse ORYX automotive service and spare-part categories.',
    url: `${SITE_URL}/categories`,
  },
};

export default function CategoriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
