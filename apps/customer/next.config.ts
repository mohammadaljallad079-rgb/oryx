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
