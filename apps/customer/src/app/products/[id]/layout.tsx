/**
 * Satisfies `output: export` for the dynamic product segment.
 *
 * A static export cannot render a dynamic segment it has no paths for, and the
 * page itself is a client component, so it cannot declare this. The preview has
 * no product rows to enumerate — the catalogue reads from the API, which does
 * not exist on GitHub Pages — so the list is empty and no product page is
 * generated. A normal server build keeps rendering this route on demand.
 */
export function generateStaticParams() {
  return [];
}

export default function ProductDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
