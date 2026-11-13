import type { Metadata } from 'next';
import { JsonLd } from '@/components/json-ld';
import { SITE_URL, productJsonLd, publicFetch, type ProductLike } from '@/lib/structured-data';

/**
 * Server layout for a product page.
 *
 * The page itself is a client component (it needs the cart context), so the
 * canonical URL, product-specific Open Graph tags and the Product JSON-LD are
 * produced here from a server-side fetch of the real catalogue record.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ sku: string }>;
}): Promise<Metadata> {
  const { sku } = await params;
  const product = await publicFetch<ProductLike>(`/storefront/products/${encodeURIComponent(sku)}`);
  if (!product) {
    return { title: 'قطع الغيار | Spare parts', alternates: { canonical: `/store/${sku}` } };
  }
  const description =
    product.descriptionEn ??
    `${product.brand ?? ''} ${product.nameEn} — ${product.sku}`.trim();
  return {
    title: `${product.nameEn} — ${product.sku}`,
    description,
    alternates: { canonical: `/store/${product.sku}` },
    openGraph: {
      type: 'website',
      title: product.nameEn,
      description,
      url: `${SITE_URL}/store/${product.sku}`,
      images: [product.image],
    },
  };
}

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const product = await publicFetch<ProductLike>(`/storefront/products/${encodeURIComponent(sku)}`);
  return (
    <>
      {product && <JsonLd data={productJsonLd(product)} />}
      {children}
    </>
  );
}
