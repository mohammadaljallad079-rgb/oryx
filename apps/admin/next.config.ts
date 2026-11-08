import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@oryx/shared'],
  eslint: {
    // Linting is run separately via `pnpm --filter @oryx/admin lint`.
    ignoreDuringBuilds: true,
  },
  // Optional same-origin API proxy. When the admin is served from a single
  // public origin (a hosted preview), pointing NEXT_PUBLIC_API_BASE_URL at
  // `/api` routes the API through Next so the HttpOnly refresh cookie is
  // first-party and SameSite=Lax keeps working. With the default absolute
  // base URL the browser talks to the API directly and this rewrite is unused.
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.ORYX_API_PROXY ?? 'http://127.0.0.1:3001'}/api/v1/:path*`,
      },
    ];
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
