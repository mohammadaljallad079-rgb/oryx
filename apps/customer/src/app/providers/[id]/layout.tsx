import { IS_STATIC_PREVIEW, previewProviders } from '@/lib/preview-data';

/**
 * Enumerates the provider pages the static export should generate.
 *
 * `output: export` cannot render a dynamic segment it has no paths for, and a
 * client component cannot export this itself — hence a server layout in the
 * same segment. Outside the preview the list is empty, so a normal build keeps
 * server-rendering this route on demand exactly as before.
 */
export function generateStaticParams() {
  if (!IS_STATIC_PREVIEW) return [];
  return previewProviders().map((provider) => ({ id: provider.id }));
}

export default function ProviderDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
