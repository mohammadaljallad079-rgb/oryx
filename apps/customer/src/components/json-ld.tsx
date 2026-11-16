/**
 * Renders a JSON-LD block.
 *
 * The data is JSON we build ourselves from catalogue rows, so it is safe to
 * inline; `<` is escaped anyway so a product name containing `</script>` cannot
 * break out of the element. It is a server component, so the block is present in
 * the first HTML response a crawler sees.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
