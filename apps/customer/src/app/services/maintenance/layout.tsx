import type { Metadata } from 'next';
import { SectionAvailability } from '@/components/section-availability';
import { SITE_URL } from '@/lib/structured-data';

export const metadata: Metadata = {
  title: 'Maintenance services',
  description:
    'Scheduled servicing, diagnostics and mechanical repair at ORYX Auto Services in Bahrain.',
  alternates: { canonical: '/services/maintenance' },
  openGraph: {
    title: 'Maintenance services | ORYX',
    description: 'Scheduled servicing, diagnostics and mechanical repair at ORYX.',
    url: `${SITE_URL}/services/maintenance`,
  },
};

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return <SectionAvailability section="maintenance">{children}</SectionAvailability>;
}
