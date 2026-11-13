'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCart } from '@/lib/cart-context';
import { useWishlist } from '@/lib/wishlist';
import { Money, SectionHead } from '@/components/ui';
import { publicApi, type StorefrontProduct, type StorefrontService } from '@/lib/api';

function discountPercent(product: StorefrontProduct): number | null {
  if (!product.compareAtPriceMinor || product.compareAtPriceMinor <= product.priceMinor) return null;
  return Math.round(((product.compareAtPriceMinor - product.priceMinor) / product.compareAtPriceMinor) * 100);
}

export function ProductCard({ product }: { product: StorefrontProduct }) {
  const { t, locale } = useUi();
  const { add } = useCart();
  const { isSaved, toggle } = useWishlist();
  const [added, setAdded] = useState(false);

  const name = locale === 'ar' ? product.nameAr : product.nameEn;
  const off = discountPercent(product);
  const fitment = product.fits.slice(0, 2);

  return (
    <article className="oryx-product-card" data-testid="product-card" data-sku={product.sku}>
      <Link href={`/store/${product.sku}`} aria-label={name}>
        <div className="oryx-product-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image} alt={name} loading="lazy" />
          {off !== null && <span className="oryx-chip">{off}% {t('store.off')}</span>}
        </div>
      </Link>

      <button
        type="button"
        className="oryx-wish"
        data-saved={isSaved(product.id)}
        aria-label={isSaved(product.id) ? t('product.wishlisted') : t('product.wishlist')}
        onClick={() => void toggle(product.id)}
        data-testid="wishlist-toggle"
      >
        {isSaved(product.id) ? '★' : '☆'}
      </button>

      <div className="oryx-product-body">
        {product.brand && <span className="oryx-product-brand">{product.brand}</span>}
        <Link href={`/store/${product.sku}`} className="oryx-product-name">
          {name}
        </Link>
        <span className="oryx-product-sku">{product.partNumber ?? product.sku}</span>

        {fitment.length > 0 && (
          <span className="oryx-fitment">
            <span>{t('store.fits')}</span>
            {fitment.map((f) => (
              <span className="oryx-tag" key={`${f.make}-${f.model}`}>
                {f.make} {f.model}
              </span>
            ))}
          </span>
        )}

        <span
          className={`oryx-stock ${product.inStock ? 'oryx-stock-in' : 'oryx-stock-out'}`}
          data-testid="stock-state"
        >
          {product.inStock ? t('store.inStock') : t('store.outOfStock')}
        </span>

        <div className="oryx-price-row">
          <span className="oryx-price">
            <Money minor={product.priceMinor} currency={product.currency} scale={product.currencyScale} />
          </span>
          {product.compareAtPriceMinor && (
            <span className="oryx-price-was">
              <Money
                minor={product.compareAtPriceMinor}
                currency={product.currency}
                scale={product.currencyScale}
              />
            </span>
          )}
        </div>

        <div className="oryx-product-actions">
          <button
            type="button"
            className="oryx-btn oryx-btn-primary"
            disabled={!product.inStock}
            onClick={() => {
              add(product.id, 1);
              setAdded(true);
              window.setTimeout(() => setAdded(false), 1600);
            }}
            data-testid="add-to-cart"
          >
            {added ? `✓ ${t('store.added')}` : t('store.addToCart')}
          </button>
          <Link href={`/store/${product.sku}`} className="oryx-btn">
            {t('store.details')}
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ServiceCard({ service }: { service: StorefrontService }) {
  const { t, locale } = useUi();
  const name = locale === 'ar' ? service.nameAr : service.nameEn;
  const description = locale === 'ar' ? service.descriptionAr : service.descriptionEn;

  return (
    <article className="oryx-service-card" data-testid="service-card" data-service={service.key}>
      <div className="oryx-service-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={service.image} alt={name} loading="lazy" />
      </div>
      <div className="oryx-service-body">
        <h3 className="oryx-h3">{name}</h3>
        <p>{description}</p>
        <span className="oryx-faint">
          {t('services.duration')}: {service.durationMinutes} {t('booking.minutes')} ·{' '}
          {locale === 'ar' ? service.turnaroundAr : service.turnaroundEn}
        </span>
        <div className="oryx-service-actions">
          <Link href={`/services/${service.key}`} className="oryx-btn oryx-btn-primary">
            {t('services.book')}
          </Link>
          <Link href={`/services/${service.key}`} className="oryx-btn">
            {t('services.learnMore')}
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({
  products,
  testId = 'product-grid',
}: {
  products: StorefrontProduct[];
  testId?: string;
}) {
  return (
    <div className="oryx-grid oryx-grid-4" data-testid={testId}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

/**
 * Featured rail for internal pages.
 *
 * Reads the same `/storefront/featured` endpoint as the homepage, so an item an
 * administrator marks featured appears in both places at once. Renders nothing
 * when the catalogue has no featured items — an empty rail is worse than none.
 */
export function FeaturedProducts({
  title,
  subtitle,
  limit = 4,
  actionHref = '/store',
  actionLabel,
}: {
  title: string;
  subtitle?: string;
  limit?: number;
  actionHref?: string;
  actionLabel?: string;
}) {
  const { t } = useUi();
  const [products, setProducts] = useState<StorefrontProduct[]>([]);

  useEffect(() => {
    let active = true;
    publicApi
      .storefrontFeatured(limit)
      .then((result) => {
        if (active) setProducts(result);
      })
      .catch(() => {
        if (active) setProducts([]);
      });
    return () => {
      active = false;
    };
  }, [limit]);

  if (products.length === 0) return null;

  return (
    <section className="oryx-section" data-testid="featured-products">
      <div className="oryx-container">
        <SectionHead
          title={title}
          subtitle={subtitle}
          action={
            <Link href={actionHref} className="oryx-btn">
              {actionLabel ?? t('nav.store')}
            </Link>
          }
        />
        <ProductGrid products={products} testId="featured-grid" />
      </div>
    </section>
  );
}
