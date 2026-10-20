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
