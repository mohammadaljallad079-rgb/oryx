import type { Metadata } from 'next';
import { JsonLd } from '@/components/json-ld';
import { SITE_URL, autoRepairJsonLd, publicFetch, type BranchLike } from '@/lib/structured-data';

/**
 * Branches page: canonical plus the site-wide AutoRepair (LocalBusiness)
 * structured data, since this is where the real address and contact details
 * are published.
 */
export const metadata: Metadata = {
  title: 'فروعنا | Our branches',
  description:
    'فروع أوريكس لخدمات السيارات في البحرين — العناوين وأرقام التواصل وساعات العمل. ORYX Auto Services branches in Bahrain: addresses, phone numbers and opening hours.',
  alternates: { canonical: '/branches' },
  openGraph: { url: `${SITE_URL}/branches`, images: ['/media/hero-services.jpg'] },
};

export default async function BranchesLayout({ children }: { children: React.ReactNode }) {
  const branches = (await publicFetch<BranchLike[]>('/storefront/branches')) ?? [];
  return (
    <>
      <JsonLd data={autoRepairJsonLd(branches)} />
      {children}
    </>
  );
}
