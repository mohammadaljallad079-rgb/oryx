import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/structured-data';

/**
 * robots.txt.
 *
 * The public catalogue and content are crawlable. The authenticated account
 * area, the cart and the checkout are not: they render a customer's own data
 * and have nothing to index. The account routes sit at the site root because
 * the `(account)` route group adds no path segment, so each is listed by its
 * real path.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/cart',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/verify',
          '/dashboard',
          '/bookings',
          '/garage',
          '/orders',
          '/favorites',
          '/notifications',
          '/profile',
          '/invoices',
          '/quotations',
          '/rfqs',
          '/returns',
          '/my-credits',
          '/support',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
