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
/**
 * `ORYX_DOCKER_BUILD=1` switches on `output: 'standalone'` for the
 * server-rendered container image. It is ignored during a static export, which
 * writes plain files rather than a server.
 */
const isDockerBuild = process.env.ORYX_DOCKER_BUILD === '1' && !isStaticExport;
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
  ...(isDockerBuild ? { output: 'standalone' as const } : {}),
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
  // Rewrites and response headers are server features, not emitted by an export.
  ...(isStaticExport
    ? {}
    : {
        /**
         * The browser bundle is built with `NEXT_PUBLIC_API_BASE_URL=/api` so
         * the deployed site talks to the API same-origin (the consumer refresh
         * cookie is scoped to `/api/v1/customer`). Behind the staging preview
         * proxy the `/api` prefix never reaches Next. When the site is served
         * directly on its own port, nothing owns `/api`, so the bundle's calls
         * 404. This forwards them to the API in that case.
         */
        async rewrites() {
          const apiTarget = (process.env.ORYX_API_INTERNAL ?? 'http://127.0.0.1:3001').replace(
            /\/$/,
            '',
          );
          // The client bundle reads `NEXT_PUBLIC_API_BASE_URL` (default `/api`)
          // and this rewrite owns `/api` on the server. If the build shell has
          // that variable exported to an absolute origin, Next inlines the
          // absolute value and the rewrite is bypassed, so the site calls that
          // origin directly. Locally that is `localhost`, which a phone cannot
          // reach, and behind the preview proxy it breaks the same-origin
          // session cookie. Refuse the combination rather than ship a bundle
          // whose API origin depends on the developer's shell.
          const inlined = process.env.NEXT_PUBLIC_API_BASE_URL;
          if (inlined && inlined !== '/api' && !isStaticExport) {
            throw new Error(
              `NEXT_PUBLIC_API_BASE_URL must be unset or '/api' when building the ` +
                `customer app (got '${inlined}'). It is inlined into the browser ` +
                `bundle, so an absolute value defeats the same-origin /api rewrite ` +
                `and makes the site unreachable from a phone. Unset it and rebuild.`,
            );
          }
          return [{ source: '/api/:path*', destination: `${apiTarget}/api/:path*` }];
        },
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
