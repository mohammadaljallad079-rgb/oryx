import type { NextConfig } from 'next';

/**
 * Customer website configuration.
 *
 * The site runs on its own port and origin so the consumer session cookie is
 * scoped to `/api/v1/customer` and is never presented to the control plane.
 *
 * Static export
 * -------------
 * The owner requires a browsable preview of this site on GitHub Pages, which
 * serves files only. `ORYX_STATIC_EXPORT=1` therefore turns the app into a
 * static export under `/oryx`. It is opt-in: a normal `next build` is exactly
 * what it was before, so the deployed platform is unaffected.
 *
 * A static export cannot host the API, so the exported build reads bundled
 * preview data and labels it in the UI — see `src/lib/preview-data.ts`.
 */

const isStaticExport = process.env.ORYX_STATIC_EXPORT === '1';
const basePath = isStaticExport ? (process.env.ORYX_BASE_PATH ?? '/oryx') : '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@oryx/shared'],
  eslint: {
    // Linting runs separately via `pnpm --filter @oryx/customer lint`.
    ignoreDuringBuilds: true,
  },
  // `assetUrl` in `src/lib/asset-url.ts` reads this for raw `<img src>` and CSS
  // `url()` values, which `basePath` does not rewrite. It is derived from the
  // same value so the two can never disagree.
  //
  // `NEXT_PUBLIC_ORYX_STATIC_EXPORT` is what makes the preview visible in the
  // *browser* bundle: Next.js inlines only `NEXT_PUBLIC_*` into client code, so
  // a bare `process.env.ORYX_STATIC_EXPORT` is `undefined` after hydration and
  // the client would re-fetch the API and render a different tree than the
  // server — a hydration mismatch, and a preview that leaks network calls.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_ORYX_STATIC_EXPORT: isStaticExport ? '1' : '',
  },
  ...(isStaticExport
    ? {
        output: 'export' as const,
        basePath,
        // Directory-style URLs, so `/providers/` resolves to `providers/index.html`
        // on a static host.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  // Response headers are a server feature and are not emitted by an export.
  ...(isStaticExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: '/:path*',
              headers: [
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
