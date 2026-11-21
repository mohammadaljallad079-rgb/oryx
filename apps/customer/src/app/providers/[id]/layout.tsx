import { IS_STATIC_PREVIEW, previewProviders } from '@/lib/preview-data';

/**
 * Enumerates the provider pages the static export should generate.
 *
 * `output: export` cannot render a dynamic segment it has no paths for, and a
 * client component cannot export this itself — hence a server layout in the
 * same segment. Outside the preview the export is `undefined`, so the route
 * keeps server-rendering on demand. Exporting a function that returns an empty
 * list instead makes Next treat the route as fully static with no fallback, and
 * every provider page answers 404.
 */
export const generateStaticParams = IS_STATIC_PREVIEW
  ? () => previewProviders().map((provider) => ({ id: provider.id }))
  : undefined;

export default function ProviderDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
