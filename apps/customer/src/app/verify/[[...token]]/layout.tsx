/**
 * Satisfies `output: export` for the public verification route.
 *
 * The segment is an optional catch-all, so an empty parameter list emits the
 * bare `/verify` page — the one a customer reaches without a code, where the
 * token can be typed by hand. A code-specific path is not prerendered because
 * the token only exists in the database; on GitHub Pages the page still renders
 * and reports that it cannot reach the service, which is the truthful outcome.
 */
export function generateStaticParams() {
  // An empty `token` array is the bare `/verify` path. Next requires at least
  // one entry for an optional catch-all, and the bare path is the only one that
  // exists without a database lookup.
  return [{ token: [] as string[] }];
}

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
