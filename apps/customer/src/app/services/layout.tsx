import type { Metadata } from 'next';
import { JsonLd } from '@/components/json-ld';
import { SERVICE_CATEGORIES } from '@/lib/api';
import { SITE_URL, serviceJsonLd } from '@/lib/structured-data';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'ORYX automotive services: periodic maintenance, inspections, mechanical and engine repair, brakes, tyres, electrical work, oil changes and computer diagnostics in Bahrain.',
  alternates: { canonical: '/services' },
  openGraph: {
    title: 'Services | ORYX',
    description: 'Periodic maintenance, inspections, repair and diagnostics at ORYX.',
    url: `${SITE_URL}/services`,
  },
};

/** One Service node per catalogue entry, from the shared catalogue itself. */
export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {SERVICE_CATEGORIES.map((category) => (
        <JsonLd
          key={category.key}
          data={serviceJsonLd({
            key: category.key,
            nameEn: category.nameEn,
            nameAr: category.nameAr,
            descriptionEn: category.descEn,
          })}
        />
      ))}
      {children}
    </>
  );
}
