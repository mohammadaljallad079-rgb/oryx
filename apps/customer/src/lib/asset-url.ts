/**
 * Base-path helper for bundled assets.
 *
 * Next.js prefixes `next/link` and `next/image` with `basePath` automatically,
 * but a raw `<img src>` or a CSS `url()` is emitted verbatim, so on a site
 * served from a sub-path those would 404. The prefix is inlined at build time
 * and is empty in a normal build, so this is a no-op outside the static export.
 *
 * It lives in its own module because both the API client and the preview data
 * need it, and the two must not import each other.
 */

export const ASSET_PREFIX = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Resolve a bundled asset path against the export's base path. */
export function assetUrl(path: string): string {
  if (!ASSET_PREFIX || !path.startsWith('/')) return path;
  return `${ASSET_PREFIX}${path}`;
}
