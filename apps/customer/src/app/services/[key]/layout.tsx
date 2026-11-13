import type { Metadata } from 'next';
import { JsonLd } from '@/components/json-ld';
import { SITE_URL, publicFetch, serviceJsonLd, type ServiceLike } from '@/lib/structured-data';

/**
 * Server layout for a service detail page: canonical, Open Graph and Service
 * JSON-LD built from the real service record (the page is a client component).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const services = (await publicFetch<ServiceLike[]>('/storefront/services')) ?? [];
  const service = services.find((item) => item.key === key);
  if (!service) {
    return { title: 'خدماتنا | Services', alternates: { canonical: `/services/${key}` } };
  }
  return {
    title: service.nameEn,
    description: service.descriptionEn,
    alternates: { canonical: `/services/${service.key}` },
    openGraph: {
      type: 'website',
      title: service.nameEn,
      description: service.descriptionEn,
      url: `${SITE_URL}/services/${service.key}`,
      images: [service.image],
    },
  };
}

export default async function ServiceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const services = (await publicFetch<ServiceLike[]>('/storefront/services')) ?? [];
  const service = services.find((item) => item.key === key);
  return (
    <>
      {service && <JsonLd data={serviceJsonLd(service)} />}
      {children}
    </>
  );
}
