import type { Metadata } from 'next';
import { IS_STATIC_PREVIEW, previewProductIds } from '@/lib/preview-data';
import { JsonLd } from '@/components/json-ld';
import {
  SITE_URL,
  productJsonLd,
  publicFetch,
  type CatalogProductLike,
} from '@/lib/structured-data';

/**
 * Enumerates the product pages the static export should generate.
 *
 * `output: export` cannot render a dynamic segment it has no paths for, and a
 * client component cannot export this itself — hence a server layout in the
 * same segment. The export must return at least one path: Next.js rejects an
 * empty parameter list for a dynamic route under `output: export`, which is
 * what broke the design-preview build. The preview catalogue therefore supplies
 * the ids. Outside the preview the export is `undefined`, so the route keeps
 * server-rendering on demand.
 */
export const generateStaticParams = IS_STATIC_PREVIEW
  ? () => previewProductIds().map((id) => ({ id }))
  : undefined;

/**
 * Per-product metadata and Product structured data.
 *
 * The page itself is a client component, so the crawler-facing tags are built
 * here on the server from the same public endpoint the page uses. When the
 * product cannot be read the title falls back to a generic one rather than
 * failing the render.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await publicFetch<CatalogProductLike>(
    `/customer/catalog/products/${encodeURIComponent(id)}`,
  );
  const canonical = `/products/${id}`;
  if (!product) {
    return { title: 'Product', alternates: { canonical } };
  }
  const description = `${product.nameEn} — ${product.store?.name ?? 'ORYX'}. Available from ORYX Auto Services in Bahrain.`;
  return {
    title: product.nameEn || product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: product.nameEn || product.name,
      description,
      url: `${SITE_URL}${canonical}`,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
    },
  };
}

export default async function ProductDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await publicFetch<CatalogProductLike>(
    `/customer/catalog/products/${encodeURIComponent(id)}`,
  );
  return (
    <>
      {product && <JsonLd data={productJsonLd(product)} />}
      {children}
    </>
  );
}
