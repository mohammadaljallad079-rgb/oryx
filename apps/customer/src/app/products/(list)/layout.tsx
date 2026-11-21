import type { Metadata } from 'next';
import { JsonLd } from '@/components/json-ld';
import {
  SITE_URL,
  productListJsonLd,
  publicFetch,
  type CatalogProductLike,
} from '@/lib/structured-data';

export const metadata: Metadata = {
  title: 'Products',
  description:
    'Browse the published ORYX Auto Services product catalogue in Bahrain, with live prices and availability.',
  alternates: { canonical: '/products' },
  openGraph: {
    title: 'Products | ORYX',
    description: 'Published products from the ORYX Auto Services catalogue.',
    url: `${SITE_URL}/products`,
  },
};

interface ProductPage {
  items: CatalogProductLike[];
}

/**
 * ItemList structured data for the catalogue listing.
 *
 * This lives in a `(list)` route group so it applies to `/products` alone, not
 * to `/products/[id]`: the product detail route is a sibling group with its own
 * layout, and a shared parent layout would have emitted the whole listing's
 * ItemList on every product page. The data comes from the same public endpoint
 * the page reads, so the listing a crawler sees matches what a visitor sees.
 */
export default async function ProductsListLayout({ children }: { children: React.ReactNode }) {
  // The products section is everything the ERP does not classify as a spare
  // part; the parts catalogue is its own section.
  const page = await publicFetch<ProductPage>(
    '/customer/catalog/products?pageSize=50&spareParts=exclude',
  );
  return (
    <>
      {page && page.items.length > 0 && (
        <JsonLd data={productListJsonLd(page.items, `${SITE_URL}/products`)} />
      )}
      {children}
    </>
  );
}
