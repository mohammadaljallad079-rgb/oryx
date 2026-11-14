import type { Metadata } from 'next';
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
    'Browse genuine and aftermarket spare parts from ORYX Auto Services in Bahrain. Filter by category and search by name or SKU.',
  alternates: { canonical: '/products' },
  openGraph: {
    title: 'Spare parts | ORYX',
    description: 'Browse genuine and aftermarket spare parts from ORYX Auto Services.',
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
  const page = await publicFetch<ProductPage>('/customer/catalog/products?pageSize=50');
  return (
    <>
      {page && page.items.length > 0 && (
        <JsonLd data={productListJsonLd(page.items, `${SITE_URL}/products`)} />
      )}
      {children}
    </>
  );
}
