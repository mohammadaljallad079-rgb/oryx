'use client';

import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCart } from '@/lib/cart-context';
import { useWishlist } from '@/lib/wishlist';
import { publicApi, type StorefrontProduct } from '@/lib/api';
import { Alert, EmptyState, Loading, Money, PageHead, SectionHead } from '@/components/ui';
import { ProductCard } from '@/components/storefront';

const CATEGORY_FALLBACK: Record<string, string> = {
  engine: '/media/cat-engine.jpg',
  filters: '/media/cat-filters.jpg',
  oil: '/media/cat-oil.jpg',
  brakes: '/media/cat-brakes.jpg',
  tyres: '/media/cat-tyres.jpg',
  batteries: '/media/cat-batteries.jpg',
  electrical: '/media/cat-electrical.jpg',
  suspension: '/media/cat-suspension.jpg',
  cooling: '/media/cat-cooling.jpg',
  accessories: '/media/cat-accessories.jpg',
  other: '/media/cat-other.jpg',
};

export default function ProductDetailPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = use(params);
  const { t, locale } = useUi();
  const { add } = useCart();
  const { isSaved, toggle } = useWishlist();
  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  const [related, setRelated] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    publicApi
      .storefrontProduct(sku)
      .then((result) => {
        if (!active) return;
        setProduct(result);
        setActiveImage(0);
        return publicApi.storefrontRelated(result.id, 4);
      })
      .then((rows) => {
        if (active && rows) setRelated(rows);
      })
      .catch(() => {
        if (active) setProduct(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sku]);

  const gallery = useMemo(() => {
    if (!product) return [];
    const fallback = product.categoryKey ? CATEGORY_FALLBACK[product.categoryKey] : undefined;
    return [product.image, fallback].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);
  }, [product]);

  if (loading) {
    return (
      <div className="oryx-container oryx-section">
        <Loading />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="oryx-container oryx-section">
        <EmptyState
          message={t('product.notFound')}
          action={
            <Link href="/store" className="oryx-btn">
              {t('nav.store')}
            </Link>
          }
        />
      </div>
    );
  }

  const name = locale === 'ar' ? product.nameAr : product.nameEn;
  const description = locale === 'ar' ? product.descriptionAr : product.descriptionEn;
  const warranty = locale === 'ar' ? product.warrantyAr : product.warrantyEn;
  const off =
    product.compareAtPriceMinor && product.compareAtPriceMinor > product.priceMinor
      ? Math.round(((product.compareAtPriceMinor - product.priceMinor) / product.compareAtPriceMinor) * 100)
      : null;

  const specs: Array<[string, string]> = [
    [t('product.brand'), product.brand ?? '—'],
    [t('product.sku'), product.sku],
    [t('store.partNumber'), product.partNumber ?? '—'],
    [t('store.condition'), product.condition === 'NEW' ? t('store.new') : t('store.refurbished')],
    [t('product.unit'), product.unit],
    [t('product.tax'), `${(product.taxRateBp / 100).toFixed(0)}%`],
  ];

  return (
    <>
      <PageHead
        eyebrow={t('nav.store')}
        title={name}
        image="/media/hero-parts.jpg"
        breadcrumb={[
          { label: t('common.home'), href: '/' },
          { label: t('nav.store'), href: '/store' },
          { label: name },
        ]}
      />

      <section className="oryx-section">
        <div className="oryx-container">
          <div className="oryx-product-detail">
            <div className="oryx-gallery">
              <div className="oryx-gallery-main">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gallery[activeImage]} alt={name} data-testid="product-image" />
              </div>
              {gallery.length > 1 && (
                <div className="oryx-gallery-thumbs">
                  {gallery.map((image, index) => (
                    <button
                      key={image}
                      type="button"
                      className="oryx-gallery-thumb"
                      aria-current={index === activeImage}
                      onClick={() => setActiveImage(index)}
                      aria-label={`${name} ${index + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              {product.brand && <span className="oryx-product-brand">{product.brand}</span>}
              <h1 className="oryx-h2" style={{ marginTop: 6 }} data-testid="product-name">
                {name}
              </h1>
              <span className="oryx-product-sku" style={{ display: 'block', marginBottom: 12 }}>
                {product.partNumber ?? product.sku}
              </span>

              <div className="oryx-price-row" style={{ marginBottom: 6 }}>
                <span className="oryx-price" style={{ fontSize: 28 }}>
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
                {off !== null && <span className="oryx-badge oryx-badge-gold">{off}% {t('store.off')}</span>}
              </div>

              <span
                className={`oryx-stock ${product.inStock ? 'oryx-stock-in' : 'oryx-stock-out'}`}
                data-testid="product-stock"
              >
                {product.inStock ? t('store.inStock') : t('store.outOfStock')}
              </span>

              <div className="oryx-buy-row">
                <div className="oryx-qty">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="−">
                    −
                  </button>
                  <input
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                    aria-label={t('product.quantity')}
                    data-testid="quantity-input"
                  />
                  <button type="button" onClick={() => setQuantity((q) => Math.min(99, q + 1))} aria-label="+">
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="oryx-btn oryx-btn-primary oryx-btn-lg"
                  disabled={!product.inStock}
                  onClick={() => {
                    add(product.id, quantity);
                    setAdded(true);
                    window.setTimeout(() => setAdded(false), 1800);
                  }}
                  data-testid="add-to-cart"
                >
                  {added ? `✓ ${t('store.added')}` : t('store.addToCart')}
                </button>
                <button
                  type="button"
                  className="oryx-btn oryx-btn-lg"
                  data-saved={isSaved(product.id)}
                  onClick={() => void toggle(product.id)}
                  data-testid="wishlist-toggle"
                >
                  {isSaved(product.id) ? `★ ${t('product.wishlisted')}` : `☆ ${t('product.wishlist')}`}
                </button>
              </div>

              {!product.inStock && (
                <div style={{ marginBottom: 16 }}>
                  <Alert>{t('store.outOfStock')}</Alert>
                </div>
              )}

              {description && (
                <>
                  <h2 className="oryx-h3" style={{ marginTop: 24 }}>
                    {t('product.description')}
                  </h2>
                  <p className="oryx-muted" style={{ marginTop: 0 }} data-testid="product-description">
                    {description}
                  </p>
                </>
              )}

              <h2 className="oryx-h3" style={{ marginTop: 24 }}>
                {t('product.specifications')}
              </h2>
              <dl className="oryx-spec-list">
                {specs.map(([label, value]) => (
                  <div className="oryx-spec-row" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              {warranty && (
                <>
                  <h2 className="oryx-h3" style={{ marginTop: 24 }}>
                    {t('product.warranty')}
                  </h2>
                  <p className="oryx-muted" style={{ marginTop: 0 }}>
                    {warranty}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="oryx-section oryx-section-tight" style={{ background: 'var(--bg-soft)' }}>
        <div className="oryx-container">
          <SectionHead title={t('product.compatibility')} />
          {product.fits.length === 0 ? (
            <EmptyState message={t('product.noFitment')} />
          ) : (
            <table className="oryx-fit-table" data-testid="fitment-table">
              <thead>
                <tr>
                  <th>{t('store.make')}</th>
                  <th>{t('store.model')}</th>
                  <th>{t('store.year')}</th>
                </tr>
              </thead>
              <tbody>
                {product.fits.map((fit) => (
                  <tr key={`${fit.make}-${fit.model}`}>
                    <td>{fit.make}</td>
                    <td>{fit.model}</td>
                    <td dir="ltr">
                      {fit.yearFrom}
                      {fit.yearTo ? `–${fit.yearTo}` : '+'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section className="oryx-section">
          <div className="oryx-container">
            <SectionHead title={t('product.related')} />
            <div className="oryx-grid oryx-grid-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
