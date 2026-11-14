import type { Metadata } from 'next';
import { JsonLd } from '@/components/json-ld';
import { SITE_URL, localBusinessJsonLd, publicFetch } from '@/lib/structured-data';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Contact ORYX Auto Services in Bahrain: book a service, reach support, or find a service centre.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact | ORYX',
    description: 'Contact ORYX Auto Services in Bahrain.',
    url: `${SITE_URL}/contact`,
  },
};

interface PublicWebsite {
  blocks: Array<{ key: string; value: string }>;
}

/**
 * LocalBusiness structured data.
 *
 * The telephone and email come from the CMS, so a search engine only ever sees
 * details the operator has actually published; an unpublished value is left out
 * rather than filled with a placeholder.
 */
export default async function ContactLayout({ children }: { children: React.ReactNode }) {
  const content = await publicFetch<PublicWebsite>('/cms/public/website?locale=en');
  const value = (key: string): string | undefined => {
    const found = content?.blocks.find((b) => b.key === key);
    return found?.value?.trim() || undefined;
  };
  const business = {
    ...localBusinessJsonLd(),
    ...(value('contact.phone') ? { telephone: value('contact.phone') } : {}),
    ...(value('contact.email') ? { email: value('contact.email') } : {}),
  };
  return (
    <>
      <JsonLd data={business} />
      {children}
    </>
  );
}
