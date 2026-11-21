import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/structured-data';

export const metadata: Metadata = {
  title: 'Technical inspections',
  description:
    'The approved ORYX technical inspection services in Bahrain: choose an inspection, see its price and book a slot.',
  alternates: { canonical: '/services/inspections' },
  openGraph: {
    title: 'Technical inspections | ORYX',
    description: 'Approved ORYX technical inspection services with live prices.',
    url: `${SITE_URL}/services/inspections`,
  },
};

export default function InspectionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
