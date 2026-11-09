import type { NextConfig } from 'next';

/**
 * `ORYX_DOCKER_BUILD=1` switches on `output: 'standalone'`, which makes
 * `next build` emit a self-contained server at `.next/standalone` with only the
 * traced dependencies. The container image copies that instead of the whole
 * workspace. It is opt-in rather than always-on so a local `next build` and the
 * existing Playwright suite keep working against the normal `.next` layout.
 */
const isDockerBuild = process.env.ORYX_DOCKER_BUILD === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@oryx/shared'],
  eslint: {
    // Linting is run separately via `pnpm --filter @oryx/admin lint`.
    ignoreDuringBuilds: true,
  },
  ...(isDockerBuild ? { output: 'standalone' as const } : {}),
  /**
   * The browser bundle is built with `NEXT_PUBLIC_API_BASE_URL=/api` so the
   * deployed app talks to the API same-origin (required for the HttpOnly
   * refresh cookie and the CSRF double-submit). Behind the staging preview
   * proxy the `/api` prefix is intercepted before it reaches Next. When the app
   * is served directly on its own port — a local `next start`, or the
   * Playwright suite — nothing owns `/api`, so the bundle's calls 404. This
   * rewrite forwards them to the API in that case.
   */
  async rewrites() {
    const apiTarget = (process.env.ORYX_API_INTERNAL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
    // The client bundle reads `NEXT_PUBLIC_API_BASE_URL`. The preview uses the
    // relative `/api` that this rewrite owns; the container deployment uses an
    // absolute public origin (`https://api.example.com/api`). A loopback or
    // preview origin is never valid — no other device can reach the build
    // host's `localhost`, and a preview host is ephemeral — and sourcing the
    // repo `.env` exports exactly such a value, which outranks `.env.local`.
    const inlined = process.env.NEXT_PUBLIC_API_BASE_URL;
    const host = inlined && inlined.startsWith('http') ? new URL(inlined).hostname : null;
    const unsafeHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1' ||
      (host?.endsWith('.prod-runtime.all-hands.dev') ?? false);
    if (inlined && inlined !== '/api' && unsafeHost) {
      throw new Error(
        `NEXT_PUBLIC_API_BASE_URL must not point at a local or preview host when ` +
          `building the admin app (got '${inlined}'). It is inlined into the browser ` +
          `bundle, so no other device can reach it. Use '/api' for the preview, or a ` +
          `real public origin for a deploy.`,
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
};

export default nextConfig;
