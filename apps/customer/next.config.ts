import type { NextConfig } from 'next';

/**
 * Customer website configuration.
 *
 * The site runs on its own port and origin so the consumer session cookie is
 * scoped to `/api/v1/customer` and is never presented to the control plane.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@oryx/shared'],
  eslint: {
    // Linting runs separately via `pnpm --filter @oryx/customer lint`.
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    // The browser talks to the site origin only. `/api/*` is proxied to the
    // API server so the consumer refresh cookie is same-origin (no CORS, no
    // cross-site cookie restrictions) in local runs and behind a single
    // preview host.
    const apiOrigin = process.env.ORYX_API_ORIGIN ?? 'http://127.0.0.1:3001';
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
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
