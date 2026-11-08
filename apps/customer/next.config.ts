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
          // The client bundle reads `NEXT_PUBLIC_API_BASE_URL`. In the preview
          // it must be the relative `/api`, which this rewrite then owns; in
          // the container deployment it is an absolute public origin
          // (`https://api.example.com/api`) and the rewrite is unused. What is
          // never valid is a loopback or preview origin: a browser on another
          // device cannot reach the build host's `localhost`, and a preview host
          // is ephemeral. Sourcing the repo `.env` (which sets
          // `http://localhost:3001/api`) exports that value, and an exported
          // variable outranks `.env.local`, so refuse the build rather than ship
          // a bundle whose API origin is unreachable from a phone.
          const inlined = process.env.NEXT_PUBLIC_API_BASE_URL;
          const host = inlined && inlined.startsWith('http') ? new URL(inlined).hostname : null;
          const unsafeHost =
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '[::1]' ||
            host === '::1' ||
            (host?.endsWith('.prod-runtime.all-hands.dev') ?? false);
          if (inlined && inlined !== '/api' && unsafeHost && !isStaticExport) {
            throw new Error(
              `NEXT_PUBLIC_API_BASE_URL must not point at a local or preview host ` +
                `when building the customer app (got '${inlined}'). It is inlined ` +
                `into the browser bundle, so no phone or other device can reach it. ` +
                `Use '/api' for the preview, or a real public origin for a deploy.`,
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
