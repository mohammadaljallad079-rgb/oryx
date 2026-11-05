import { IS_STATIC_PREVIEW, previewProductIds } from '@/lib/preview-data';

/**
 * Enumerates the product pages the static export should generate.
 *
 * `output: export` cannot render a dynamic segment it has no paths for, and a
 * client component cannot export this itself — hence a server layout in the
 * same segment. The export must return at least one path: Next.js rejects an
 * empty parameter list for a dynamic route under `output: export`, which is
 * what broke the design-preview build. The preview catalogue therefore supplies
 * the ids, and outside the preview the list is empty so a normal build keeps
 * server-rendering this route on demand exactly as before.
 */
export function generateStaticParams() {
  if (!IS_STATIC_PREVIEW) return [];
  return previewProductIds().map((id) => ({ id }));
}

export default function ProductDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
