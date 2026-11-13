import type { Metadata } from 'next';
import { JsonLd } from '@/components/json-ld';
import { SITE_URL, autoRepairJsonLd, publicFetch, type BranchLike } from '@/lib/structured-data';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: SITE_URL, images: ['/media/hero-services.jpg'] },
};

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const branches = (await publicFetch<BranchLike[]>('/storefront/branches')) ?? [];
  return (
    <>
      <JsonLd data={autoRepairJsonLd(branches)} />
      {children}
    </>
  );
}
