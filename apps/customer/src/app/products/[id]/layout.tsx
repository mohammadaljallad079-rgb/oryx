import { IS_STATIC_PREVIEW, previewProductIds } from '@/lib/preview-data';

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

export default function ProductDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
