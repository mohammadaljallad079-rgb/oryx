import type { Metadata } from 'next';
import { SectionAvailability } from '@/components/section-availability';
import { JsonLd } from '@/components/json-ld';
import {
  SITE_URL,
  productListJsonLd,
  publicFetch,
  type CatalogProductLike,
} from '@/lib/structured-data';

export const metadata: Metadata = {
  title: 'Spare parts',
  description:
    'Vehicle spare parts from ORYX Auto Services in Bahrain, with live price and availability from ORYX stock.',
  alternates: { canonical: '/spare-parts' },
  openGraph: {
    title: 'Spare parts | ORYX',
    description: 'Vehicle spare parts from ORYX stock with live price and availability.',
    url: `${SITE_URL}/spare-parts`,
  },
};

interface ProductPage {
  items: CatalogProductLike[];
}

/**
 * The parts section reads the same catalogue as the products section, filtered
 * to the rows the ERP classifies as spare parts, so the two lists cannot
 * overlap or lose an item.
 */
export default async function SparePartsLayout({ children }: { children: React.ReactNode }) {
  const page = await publicFetch<ProductPage>(
    '/customer/catalog/products?pageSize=50&spareParts=only',
  );
  return (
    <>
      {page && page.items.length > 0 && (
        <JsonLd data={productListJsonLd(page.items, `${SITE_URL}/spare-parts`)} />
      )}
      <SectionAvailability section="spare_parts">{children}</SectionAvailability>
    </>
  );
}
